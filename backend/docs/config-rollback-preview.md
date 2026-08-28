# Config Rollback Preview

The Config Rollback Preview feature provides safe, auditable configuration version control with field-level diff preview before rollback. This enables operators to confidently revert configuration changes while maintaining complete history.

## Features

### Core Capabilities

1. **Version History**
   - Immutable version records for each config change
   - Auto-incrementing version numbers per config key
   - Change summary and authorship tracking
   - Current version indicator

2. **Field-Level Diff**
   - Compare any version against current state
   - Identify modified, added, and removed fields
   - Show before/after values
   - Visual diff table in UI

3. **Rollback Preview**
   - Generate diff before applying rollback
   - Impact summary describing scope of change
   - No changes applied until explicitly confirmed

4. **Safe Rollback**
   - Rollback creates **new version** (never overwrites history)
   - Current version remains in history
   - Payload from target version becomes new current state
   - Fully auditable: all versions retained

5. **Config Key Namespace**
   - Each config key has independent version history
   - Examples: `alert-thresholds`, `rate-limits`, `feature-flags`
   - Arbitrary JSON payloads per version

6. **Admin UI**
   - Config key lookup form
   - Version history table (version#, summary, author, timestamp)
   - Preview rollback button per non-current version
   - Field-level diff table with change type badges
   - Apply rollback confirmation flow

7. **Metrics Integration**
   - Counter: `config_rollbacks_total`
   - Labels: config_key, target_version
   - Track rollback operations

## Architecture

### Database Schema

**Table: `config_versions`**

```sql
CREATE TABLE config_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  config_key VARCHAR(255) NOT NULL,
  version_number INTEGER NOT NULL,
  payload JSONB NOT NULL,
  change_summary TEXT,
  applied_by VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(config_key, version_number)
);

CREATE INDEX idx_config_versions_key ON config_versions(config_key);
CREATE INDEX idx_config_versions_current ON config_versions(config_key, is_current);
CREATE INDEX idx_config_versions_key_version ON config_versions(config_key, version_number DESC);
```

### Service Layer

**`configVersion.service.ts`**

Singleton service providing:

- `createVersion(configKey, payload, changeSummary?, appliedBy)`: Create new version
- `getVersionHistory(configKey)`: Fetch all versions for a config key
- `getCurrentVersion(configKey)`: Get the current version
- `getRollbackPreview(configKey, targetVersion)`: Generate field-level diff
- `applyRollback(configKey, targetVersion, appliedBy)`: Execute rollback (creates new version)

### Rollback Logic

When rolling back from v5 to v3:

1. Fetch v3 payload
2. Fetch current version (v5) payload
3. Compute field-level diff
4. **Create v6** with v3's payload as new current
5. Set `is_current = false` for v5
6. Set `is_current = true` for v6

**History is never deleted or overwritten.**

### Field Diff Algorithm

```typescript
interface FieldDiff {
  field: string;
  currentValue: unknown;
  targetValue: unknown;
  changeType: "modified" | "added" | "removed";
}

function computeDiff(current: object, target: object): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  
  // Check all current keys
  for (const key of Object.keys(current)) {
    if (!(key in target)) {
      diffs.push({
        field: key,
        currentValue: current[key],
        targetValue: undefined,
        changeType: "removed",
      });
    } else if (current[key] !== target[key]) {
      diffs.push({
        field: key,
        currentValue: current[key],
        targetValue: target[key],
        changeType: "modified",
      });
    }
  }
  
  // Check for added keys in target
  for (const key of Object.keys(target)) {
    if (!(key in current)) {
      diffs.push({
        field: key,
        currentValue: undefined,
        targetValue: target[key],
        changeType: "added",
      });
    }
  }
  
  return diffs;
}
```

## API Endpoints

### GET /api/v1/admin/config-versions/:configKey

Get version history for a config key.

**Headers:**
- `x-api-key`: Admin API key (required)

**Response:**

```json
{
  "versions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "configKey": "alert-thresholds",
      "versionNumber": 3,
      "payload": {
        "maxLatency": 5000,
        "minBalance": 100
      },
      "changeSummary": "Update maxLatency to 5s",
      "appliedBy": "admin",
      "appliedAt": "2026-08-26T12:00:00Z",
      "isCurrent": true
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "configKey": "alert-thresholds",
      "versionNumber": 2,
      "payload": {
        "maxLatency": 3000,
        "minBalance": 100
      },
      "changeSummary": "Update maxLatency to 3s",
      "appliedBy": "alice",
      "appliedAt": "2026-08-25T10:00:00Z",
      "isCurrent": false
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "configKey": "alert-thresholds",
      "versionNumber": 1,
      "payload": {
        "maxLatency": 1000,
        "minBalance": 50
      },
      "changeSummary": "Initial configuration",
      "appliedBy": "bob",
      "appliedAt": "2026-08-20T08:00:00Z",
      "isCurrent": false
    }
  ]
}
```

### GET /api/v1/admin/config-versions/:configKey/rollback-preview/:versionNumber

Preview rollback to a specific version.

**Headers:**
- `x-api-key`: Admin API key (required)

**Response:**

```json
{
  "configKey": "alert-thresholds",
  "currentVersion": 3,
  "targetVersion": 2,
  "diff": [
    {
      "field": "maxLatency",
      "currentValue": 5000,
      "targetValue": 3000,
      "changeType": "modified"
    }
  ],
  "impactSummary": "Rolling back from v3 to v2 will modify 1 field: maxLatency (5000 → 3000). This is a safe operation."
}
```

**Change Types:**
- `modified`: Field exists in both, value differs
- `added`: Field exists in target but not current (will be added)
- `removed`: Field exists in current but not target (will be removed)

### POST /api/v1/admin/config-versions/:configKey/rollback/:versionNumber

Apply rollback to a specific version. Creates a new version.

**Headers:**
- `x-api-key`: Admin API key (required)

**Body (optional):**

```json
{
  "changeSummary": "Rollback to v2 due to performance issues"
}
```

**Response:**

```json
{
  "message": "Rollback applied. A new version (v4) has been created with the v2 payload.",
  "newVersion": {
    "id": "880e8400-e29b-41d4-a716-446655440003",
    "configKey": "alert-thresholds",
    "versionNumber": 4,
    "payload": {
      "maxLatency": 3000,
      "minBalance": 100
    },
    "changeSummary": "Rollback to v2 due to performance issues",
    "appliedBy": "admin",
    "appliedAt": "2026-08-26T14:00:00Z",
    "isCurrent": true
  }
}
```

### POST /api/v1/admin/config-versions/:configKey

Create a new version for a config key.

**Headers:**
- `x-api-key`: Admin API key (required)

**Body:**

```json
{
  "payload": {
    "maxLatency": 8000,
    "minBalance": 150,
    "alertEmail": "ops@bridgewatch.io"
  },
  "changeSummary": "Add alertEmail field and increase thresholds"
}
```

**Validation:**
- `payload`: Required, valid JSON object
- `changeSummary`: Optional string

**Response:**

```json
{
  "version": {
    "id": "990e8400-e29b-41d4-a716-446655440004",
    "configKey": "alert-thresholds",
    "versionNumber": 5,
    "payload": {
      "maxLatency": 8000,
      "minBalance": 150,
      "alertEmail": "ops@bridgewatch.io"
    },
    "changeSummary": "Add alertEmail field and increase thresholds",
    "appliedBy": "admin",
    "appliedAt": "2026-08-26T15:00:00Z",
    "isCurrent": true
  }
}
```

## Frontend Admin UI

**Location:** `/admin/config-rollback`

### Features

1. **Config Key Lookup**
   - Input field for config key
   - Load history button
   - Displays empty state if no versions found

2. **Version History Table**
   - Columns: Version, Summary, Applied by, Applied at, Status, Actions
   - Version numbers with `v` prefix (e.g., `v3`)
   - "Current" badge on active version
   - Change summary in truncated form
   - Applied timestamp in local time

3. **Preview Rollback Button**
   - Visible for non-current versions
   - Opens rollback preview panel
   - Disabled for current version

4. **Rollback Preview Panel**
   - Target version indicator (e.g., "→ v2")
   - Impact summary text
   - Field-level diff table:
     - Field name (monospace)
     - Change type badge (modified/added/removed)
     - Current value (JSON formatted)
     - Target value (JSON formatted)
   - Apply rollback button
   - Cancel button

5. **Apply Rollback Flow**
   - Confirm action with "Apply rollback to vX" button
   - Shows success message with new version number
   - Refreshes version history
   - Clears preview panel

6. **Create Version Form**
   - Config key input
   - JSON payload textarea
   - Change summary input (optional)
   - Create version button
   - JSON validation feedback

## Usage Examples

### Example 1: View version history

```bash
curl http://localhost:3001/api/v1/admin/config-versions/alert-thresholds \
  -H "x-api-key: YOUR_ADMIN_KEY"
```

### Example 2: Preview rollback to v2

```bash
curl http://localhost:3001/api/v1/admin/config-versions/alert-thresholds/rollback-preview/2 \
  -H "x-api-key: YOUR_ADMIN_KEY"
```

Response:

```json
{
  "configKey": "alert-thresholds",
  "currentVersion": 3,
  "targetVersion": 2,
  "diff": [
    {
      "field": "maxLatency",
      "currentValue": 5000,
      "targetValue": 3000,
      "changeType": "modified"
    }
  ],
  "impactSummary": "Rolling back from v3 to v2 will modify 1 field: maxLatency (5000 → 3000). This is a safe operation."
}
```

### Example 3: Apply rollback

```bash
curl -X POST http://localhost:3001/api/v1/admin/config-versions/alert-thresholds/rollback/2 \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{
    "changeSummary": "Reverting latency threshold increase due to false positives"
  }'
```

Response:

```json
{
  "message": "Rollback applied. A new version (v4) has been created with the v2 payload.",
  "newVersion": {
    "id": "...",
    "configKey": "alert-thresholds",
    "versionNumber": 4,
    "isCurrent": true,
    /* ... */
  }
}
```

### Example 4: Create a new version

```bash
curl -X POST http://localhost:3001/api/v1/admin/config-versions/feature-flags \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{
    "payload": {
      "newDashboard": true,
      "advancedAnalytics": false,
      "telegramIntegration": true
    },
    "changeSummary": "Enable Telegram integration"
  }'
```

## Integration with Change Approval

When `REQUIRE_APPROVAL_FOR_ROLLBACK=true`, the rollback endpoint should:

1. Create a change request with `changeType: "config_update"`
2. Store rollback details in `payload`:
   ```json
   {
     "configKey": "alert-thresholds",
     "targetVersion": 2,
     "action": "rollback"
   }
   ```
3. Wait for approval workflow
4. Apply rollback only after approval

Implementation:

```typescript
if (process.env.REQUIRE_APPROVAL_FOR_ROLLBACK === "true") {
  // Create change request instead of direct rollback
  const request = await changeApproval.createRequest({
    title: `Rollback ${configKey} to v${targetVersion}`,
    description: `Revert configuration to version ${targetVersion}`,
    changeType: "config_update",
    payload: {
      configKey,
      targetVersion,
      action: "rollback",
    },
  });
  
  return reply.status(202).send({
    message: "Change request created. Awaiting approval.",
    changeRequestId: request.id,
  });
} else {
  // Direct rollback
  const newVersion = await configVersion.applyRollback(
    configKey,
    targetVersion,
    username
  );
  return reply.send({ message: "Rollback applied", newVersion });
}
```

## Version Compaction (Future)

For config keys with many versions (>100), consider implementing compaction:

1. Archive old non-current versions to cold storage
2. Keep current version and last N versions in hot database
3. Provide archive lookup for historical analysis

## Metrics

**Counter:** `config_rollbacks_total`

Labels:
- `config_key`: Configuration key
- `target_version`: Version rolled back to

Example Prometheus queries:

```promql
# Rollback rate by config key
sum by (config_key) (rate(config_rollbacks_total[1h]))

# Total rollbacks in last 24h
sum(increase(config_rollbacks_total[24h]))
```

## Best Practices

### Version Summaries

Write clear, actionable summaries:

- ✅ "Increase maxLatency to 5s to reduce false positive alerts"
- ✅ "Rollback: revert sampling rate due to performance impact"
- ❌ "Update config"
- ❌ "Change"

### Payload Structure

Keep payloads flat and simple:

- ✅ `{ "maxLatency": 5000, "minBalance": 100 }`
- ❌ `{ "thresholds": { "alert": { "latency": { "max": 5000 } } } }`

Nested objects make diffs harder to read.

### Rollback Safety

Before rolling back:

1. **Test in staging**: Apply rollback in dev/staging first
2. **Review diff carefully**: Ensure no unexpected field removals
3. **Coordinate with team**: Notify if rollback affects multiple systems
4. **Monitor after rollback**: Watch metrics for 15-30 minutes post-rollback

### Config Key Naming

Use kebab-case for config keys:

- ✅ `alert-thresholds`, `rate-limits`, `feature-flags`
- ❌ `alertThresholds`, `rate_limits`, `FeatureFlags`

## Testing

Run tests:

```bash
# Unit tests
npm test -- configVersion.service.test.ts

# Integration tests
npm test -- configVersions.test.ts

# Frontend tests
npm test -- ConfigRollback.test.tsx

# E2E tests
npm run test:e2e -- config-rollback-admin.spec.ts
```

## Future Enhancements

1. **Scheduled rollback**: Apply rollback at specified time
2. **Conditional rollback**: Roll back automatically if metric crosses threshold
3. **Rollback templates**: Common rollback scenarios with pre-filled summaries
4. **Diff export**: Download diff as JSON/YAML
5. **Multi-key rollback**: Roll back multiple related configs atomically
6. **Rollback preview in Slack**: Post diff to channel for approval
7. **Auto-rollback on error**: If new config causes errors, auto-revert
8. **Version tags**: Label versions (e.g., "stable", "experimental")
9. **Payload schema validation**: Enforce JSON schema per config key
10. **Config inheritance**: Base configs with environment overrides

## Troubleshooting

### Cannot roll back to current version

**Symptom:** Error when previewing rollback to current version

**Cause:** Current version and target version are the same.

**Fix:** Select a different (non-current) version to roll back to.

### Diff shows no changes but rollback still creates new version

**Symptom:** Preview shows empty diff but rollback creates v4 identical to v3.

**Cause:** Payloads are structurally identical. This is expected behavior.

**Impact:** Minor version number increment. No functional change.

**Fix:** Avoid unnecessary rollbacks. Preview before applying.

### Version number gaps

**Symptom:** Versions jump from v2 to v5 (missing v3, v4).

**Cause:** Versions were created then immediately rolled back, or compaction removed intermediate versions.

**Impact:** None. Version numbers are monotonic but not necessarily contiguous.

### Rollback doesn't apply to running system

**Symptom:** Rollback succeeds but config in memory hasn't changed.

**Cause:** Application hasn't reloaded config from database.

**Fix:** Implement config reload mechanism:
- WebSocket push notification to reload
- Polling interval to check version number
- Manual restart if no hot-reload available

