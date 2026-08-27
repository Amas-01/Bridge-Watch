# Change Approval Workflow

The Change Approval Workflow implements a two-person review process (four-eyes principle) for operational configuration changes. This reduces the risk of misconfiguration and ensures critical changes receive peer review before application.

## Features

### Core Capabilities

1. **Request Lifecycle Management**
   - **Draft**: Initial creation state
   - **Pending Approval**: Submitted for review
   - **Approved**: Peer-reviewed and ready to apply
   - **Rejected**: Review denied with required comment
   - **Applied**: Change successfully applied to system
   - **Cancelled**: Request withdrawn before completion

2. **Four-Eyes Enforcement**
   - Submitter cannot approve their own requests
   - Backend validation prevents self-approval
   - Different user required for approval/rejection

3. **Change Types**
   - `config_update`: Configuration value changes
   - `rule_change`: Alert or monitoring rule modifications
   - `sampling_update`: Request sampling rate adjustments
   - `other`: General operational changes

4. **Payload Storage**
   - Arbitrary JSON payload per request
   - Stores complete change parameters
   - Used for preview and application

5. **Review Comments**
   - Required for rejection (explains why)
   - Optional for approval
   - Stored in audit trail

6. **Admin UI**
   - Status-based filtering tabs
   - Pending approval counter
   - Inline review panel
   - JSON payload preview
   - Transition buttons per status

7. **Metrics Integration**
   - Counter: `change_requests_total`
   - Labels: change_type, status
   - Track approval workflow usage

## Architecture

### Database Schema

**Table: `change_requests`**

```sql
CREATE TABLE change_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  change_type VARCHAR(50) NOT NULL CHECK (change_type IN (
    'config_update', 'rule_change', 'sampling_update', 'other'
  )),
  payload JSONB NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_approval', 'approved', 'rejected', 'applied', 'cancelled'
  )),
  submitted_by VARCHAR(255) NOT NULL,
  submitted_at TIMESTAMPTZ,
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_change_requests_status ON change_requests(status);
CREATE INDEX idx_change_requests_submitted_by ON change_requests(submitted_by);
CREATE INDEX idx_change_requests_submitted_at ON change_requests(submitted_at DESC);
```

### Service Layer

**`changeApproval.service.ts`**

Singleton service providing:

- `getAllRequests(status?, submittedBy?)`: Fetch requests with optional filters
- `getRequestById(id)`: Fetch single request
- `createRequest(request)`: Create new draft request
- `submitForApproval(id, username)`: Transition draft → pending_approval
- `approveRequest(id, username, comment?)`: Transition pending → approved (enforces four-eyes)
- `rejectRequest(id, username, comment)`: Transition pending → rejected (comment required)
- `applyChange(id, username)`: Transition approved → applied
- `cancelRequest(id)`: Transition to cancelled

### State Transitions

```
draft ──submit──> pending_approval
                      │
                      ├──approve──> approved ──apply──> applied
                      │
                      └──reject──> rejected

Any state (except applied) ──cancel──> cancelled
```

### Four-Eyes Validation

In `approveRequest()` and `rejectRequest()`:

```typescript
if (request.submitted_by === username) {
  throw new Error(
    "Four-eyes principle violation: approver must be different from submitter"
  );
}
```

## API Endpoints

### GET /api/v1/admin/change-requests

Get all change requests.

**Headers:**
- `x-api-key`: Admin API key (required)

**Query Parameters:**
- `status`: Filter by status (optional)
- `submittedBy`: Filter by submitter username (optional)

**Response:**

```json
{
  "requests": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Increase rate limit threshold",
      "description": "Need to increase limit for USDC bridge to handle peak traffic",
      "changeType": "config_update",
      "payload": { "rateLimit": 1000 },
      "status": "pending_approval",
      "submittedBy": "alice",
      "submittedAt": "2026-08-24T10:00:00Z",
      "reviewedBy": null,
      "reviewedAt": null,
      "reviewComment": null,
      "appliedAt": null,
      "createdAt": "2026-08-24T09:00:00Z",
      "updatedAt": "2026-08-24T10:00:00Z"
    }
  ]
}
```

### POST /api/v1/admin/change-requests

Create a new change request (status = draft).

**Headers:**
- `x-api-key`: Admin API key (required)

**Body:**

```json
{
  "title": "Update sampling rule rate",
  "description": "Adjust sampling rate to 25% for transaction endpoints",
  "changeType": "sampling_update",
  "payload": {
    "ruleId": "550e8400-e29b-41d4-a716-446655440000",
    "newRate": 0.25
  }
}
```

**Validation:**
- `title`: Required, 1-255 characters
- `description`: Required
- `changeType`: Required, valid change type
- `payload`: Required, valid JSON object

**Response:**

```json
{
  "request": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "title": "Update sampling rule rate",
    "description": "Adjust sampling rate to 25% for transaction endpoints",
    "changeType": "sampling_update",
    "payload": { "ruleId": "...", "newRate": 0.25 },
    "status": "draft",
    "submittedBy": "bob",
    "submittedAt": null,
    "reviewedBy": null,
    "reviewedAt": null,
    "reviewComment": null,
    "appliedAt": null,
    "createdAt": "2026-08-26T12:00:00Z",
    "updatedAt": "2026-08-26T12:00:00Z"
  }
}
```

### POST /api/v1/admin/change-requests/:id/submit

Submit a draft request for approval.

**Headers:**
- `x-api-key`: Admin API key (required)

**Response:**

```json
{
  "message": "Change request submitted for approval"
}
```

### POST /api/v1/admin/change-requests/:id/approve

Approve a pending request. Enforces four-eyes principle.

**Headers:**
- `x-api-key`: Admin API key (required)

**Body:**

```json
{
  "comment": "Reviewed the payload, looks good to apply"
}
```

**Response:**

```json
{
  "message": "Change request approved"
}
```

**Error (four-eyes violation):**

```json
{
  "error": "Four-eyes principle violation: approver must be different from submitter"
}
```

### POST /api/v1/admin/change-requests/:id/reject

Reject a pending request. Comment is required.

**Headers:**
- `x-api-key`: Admin API key (required)

**Body:**

```json
{
  "comment": "Rate limit value is too high, please revise to 500"
}
```

**Response:**

```json
{
  "message": "Change request rejected"
}
```

### POST /api/v1/admin/change-requests/:id/apply

Apply an approved change request.

**Headers:**
- `x-api-key`: Admin API key (required)

**Response:**

```json
{
  "message": "Change applied successfully"
}
```

**Note:** The actual application logic is left to the caller. The service only updates status to `applied` and records `applied_at` timestamp. Integration with specific config systems (sampling rules, alert thresholds, etc.) must be implemented separately.

### POST /api/v1/admin/change-requests/:id/cancel

Cancel a change request.

**Headers:**
- `x-api-key`: Admin API key (required)

**Response:**

```json
{
  "message": "Change request cancelled"
}
```

## Frontend Admin UI

**Location:** `/admin/change-requests`

### Features

1. **Status Tabs**
   - All / Draft / Pending / Approved / Rejected / Applied
   - Highlight active tab
   - Filter requests by status

2. **Pending Approval Counter**
   - Stat card showing count of `pending_approval` requests
   - Total requests count

3. **Request Cards**
   - Title, description, status badge
   - Change type badge
   - Submitter and submission time
   - Reviewer info (if reviewed)
   - Expandable payload preview (JSON formatted)

4. **Status-Specific Actions**
   - **Draft**: Submit for review, Cancel
   - **Pending**: Review button (opens inline panel), Cancel
   - **Approved**: Apply change button

5. **Inline Review Panel**
   - Comment textarea (optional for approve, required for reject)
   - Approve / Reject buttons
   - Cancel button
   - Validation: rejects without comment show error

6. **Create Form**
   - Title, description inputs
   - Change type selector
   - JSON payload textarea with validation
   - Create draft button

## Usage Examples

### Example 1: Create and submit a config change

```bash
# Step 1: Create draft
curl -X POST http://localhost:3001/api/v1/admin/change-requests \
  -H "Content-Type: application/json" \
  -H "x-api-key: ALICE_ADMIN_KEY" \
  -d '{
    "title": "Increase rate limit for USDC bridge",
    "description": "Peak traffic requires higher throughput",
    "changeType": "config_update",
    "payload": {
      "bridge": "circle-usdc",
      "config_key": "rate_limit_max",
      "new_value": 1000,
      "old_value": 500
    }
  }'
# Returns: { "request": { "id": "...", "status": "draft" } }

# Step 2: Submit for approval
REQUEST_ID="..."
curl -X POST http://localhost:3001/api/v1/admin/change-requests/$REQUEST_ID/submit \
  -H "x-api-key: ALICE_ADMIN_KEY"
# Returns: { "message": "Change request submitted for approval" }
```

### Example 2: Approve a request (different user)

```bash
REQUEST_ID="..."
curl -X POST http://localhost:3001/api/v1/admin/change-requests/$REQUEST_ID/approve \
  -H "Content-Type: application/json" \
  -H "x-api-key: BOB_ADMIN_KEY" \
  -d '{
    "comment": "Verified the new rate limit aligns with infrastructure capacity"
  }'
# Returns: { "message": "Change request approved" }
```

### Example 3: Reject a request

```bash
REQUEST_ID="..."
curl -X POST http://localhost:3001/api/v1/admin/change-requests/$REQUEST_ID/reject \
  -H "Content-Type: application/json" \
  -H "x-api-key: BOB_ADMIN_KEY" \
  -d '{
    "comment": "Rate limit value is too high. Please revise to 750 and resubmit."
  }'
# Returns: { "message": "Change request rejected" }
```

### Example 4: Apply an approved change

```bash
REQUEST_ID="..."
curl -X POST http://localhost:3001/api/v1/admin/change-requests/$REQUEST_ID/apply \
  -H "x-api-key: ALICE_ADMIN_KEY"
# Returns: { "message": "Change applied successfully" }
```

## Integration with Config Systems

The change approval workflow stores the **intent** of a change but does not automatically apply it. Integration code must:

1. Fetch approved change requests
2. Parse the `payload` field
3. Apply changes to the target system (database, config file, external API)
4. Call `POST /api/v1/admin/change-requests/:id/apply` to mark as applied

### Example: Apply sampling rule change

```typescript
// In a background job or manual trigger
async function applySamplingRuleChange(requestId: string) {
  const request = await changeApproval.getRequestById(requestId);
  
  if (request.status !== "approved") {
    throw new Error("Request must be approved before applying");
  }
  
  const { ruleId, newRate } = request.payload as {
    ruleId: string;
    newRate: number;
  };
  
  // Apply the change
  await requestSampling.updateRule(ruleId, { sampleRate: newRate });
  
  // Mark as applied
  await changeApproval.applyChange(requestId, "system");
  
  logger.info({ requestId, ruleId, newRate }, "Sampling rule change applied");
}
```

## Metrics

**Counter:** `change_requests_total`

Labels:
- `change_type`: Type of change
- `status`: Current status

Example Prometheus queries:

```promql
# Pending approval count
sum(change_requests_total{status="pending_approval"})

# Approval rate
sum(rate(change_requests_total{status="approved"}[1h]))
/
sum(rate(change_requests_total{status=~"approved|rejected"}[1h]))

# Changes by type
sum by (change_type) (rate(change_requests_total[24h]))
```

## Configuration

### Environment Variables

**`REQUIRE_APPROVAL_FOR_ROLLBACK`** (default: `false`)

If set to `true`, config rollbacks must go through the change approval workflow. If `false`, rollbacks can be applied directly by admins.

Add to `.env`:

```bash
REQUIRE_APPROVAL_FOR_ROLLBACK=true
```

## Best Practices

### When to Use Change Approval

**Always require approval for:**
- Production config changes
- Rate limit adjustments
- Alert threshold modifications
- Sampling rule updates
- Database schema changes (if managed through workflow)

**Optional for:**
- Development/staging environments
- Non-critical config tweaks
- Emergency hotfixes (use override mechanism if needed)

### Review Guidelines

1. **Verify payload correctness**: Check JSON structure and values
2. **Assess impact**: Will this change affect production traffic?
3. **Check dependencies**: Are related systems compatible with this change?
4. **Require testing**: Has this been tested in staging first?
5. **Document reasoning**: Leave clear review comments for audit trail

### Audit Trail

All state transitions are logged with:
- User who performed the action
- Timestamp
- Review comments (if applicable)

Query audit trail:

```sql
SELECT 
  id, 
  title, 
  status, 
  submitted_by, 
  reviewed_by, 
  review_comment, 
  applied_at
FROM change_requests
WHERE status = 'applied'
ORDER BY applied_at DESC
LIMIT 100;
```

## Testing

Run tests:

```bash
# Unit tests
npm test -- changeApproval.service.test.ts

# Integration tests
npm test -- changeRequests.test.ts

# Frontend tests
npm test -- ChangeRequests.test.tsx

# E2E tests
npm run test:e2e -- change-approval-admin.spec.ts
```

## Future Enhancements

1. **Scheduled application**: Apply approved changes at specified time
2. **Rollback capability**: Revert applied changes
3. **Bulk approval**: Approve multiple related requests at once
4. **Email notifications**: Alert reviewers of pending requests
5. **Slack integration**: Post pending approvals to channel
6. **Change templates**: Pre-defined payload structures per change type
7. **Approval delegation**: Assign reviewers to specific change types
8. **SLA tracking**: Monitor time from submission to application
9. **Automated testing**: Run validation checks before approval
10. **Change impact prediction**: ML-based risk scoring

## Troubleshooting

### Four-eyes violation error

**Symptom:** Error when approving: "approver must be different from submitter"

**Cause:** Same user who submitted the request is trying to approve it.

**Fix:** Use a different admin account to approve the request.

### Request stuck in pending_approval

**Symptom:** No reviewers available to approve.

**Fix:** 
1. Add more admin users with approval privileges
2. Implement approval delegation
3. Use emergency override (future feature)

### Payload JSON parsing error

**Symptom:** "Payload must be valid JSON"

**Cause:** Malformed JSON in payload field.

**Fix:** Validate JSON before submission using a linter or online validator.

