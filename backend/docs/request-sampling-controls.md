# Request Sampling Controls

The Request Sampling Controls feature provides fine-grained control over observability overhead by intelligently sampling HTTP requests based on configurable rules. This allows operators to balance detailed tracing coverage with system performance.

## Features

### Core Capabilities

1. **Rule-based Sampling**
   - Define multiple sampling rules with different rates
   - Target all requests or specific endpoints
   - Priority-based rule evaluation
   - Enable/disable rules without deletion

2. **Sample Rate Control**
   - Configurable sample rates from 0% to 100%
   - Per-rule rate configuration
   - Deterministic sampling based on request fingerprint

3. **Request Targeting**
   - `all_requests`: Sample across all HTTP requests
   - `endpoint`: Target specific API endpoints by path pattern
   - Priority ordering ensures most specific rules match first

4. **Admin UI**
   - View all sampling rules in a sortable table
   - Create new rules with rate and target validation
   - Toggle rule enabled state
   - Delete obsolete rules

5. **Metrics Integration**
   - Counter: `sampling_rule_evaluations_total`
   - Labels: rule_id, decision (sample/skip)
   - Prometheus-compatible metrics endpoint

## Architecture

### Database Schema

**Table: `sampling_rules`**

```sql
CREATE TABLE sampling_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sample_rate NUMERIC(5,4) NOT NULL CHECK (sample_rate >= 0 AND sample_rate <= 1),
  target VARCHAR(50) NOT NULL CHECK (target IN ('all_requests', 'endpoint')),
  target_value TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 0,
  created_by VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sampling_rules_enabled ON sampling_rules(enabled);
CREATE INDEX idx_sampling_rules_priority ON sampling_rules(priority DESC);
```

### Service Layer

**`requestSampling.service.ts`**

Singleton service providing:

- `getAllRules()`: Fetch all rules ordered by priority
- `createRule(rule)`: Create and validate a new sampling rule
- `updateRule(id, updates)`: Modify an existing rule
- `deleteRule(id)`: Remove a rule
- `evaluateRules(method, path)`: Evaluate rules against a request and return sampling decision

### Middleware

**`requestSampling.middleware.ts`**

Fastify preHandler hook that:

1. Evaluates sampling rules against incoming request
2. Attaches `samplingDecision` to `request` object
3. Increments metrics counter with decision label
4. Passes control to downstream handlers

Augments `FastifyRequest` type:

```typescript
declare module "fastify" {
  interface FastifyRequest {
    samplingDecision?: { shouldSample: boolean; ruleId: string | null };
  }
}
```

### Evaluation Logic

Rules are evaluated in priority order (highest first):

1. **Filter enabled rules**: Only active rules participate
2. **Match target**: 
   - `all_requests` always matches
   - `endpoint` matches if `targetValue` regex matches request path
3. **Deterministic sampling**: Hash request fingerprint and compare to sample rate threshold
4. **Return first match**: First rule to match determines sampling decision

Fingerprint: `${method}:${path}:${timestamp_bucket}`

This ensures consistent sampling decisions for the same endpoint within a time window.

## API Endpoints

### GET /api/v1/admin/sampling-rules

Get all sampling rules.

**Headers:**
- `x-api-key`: Admin API key (required)

**Response:**

```json
{
  "rules": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "High traffic sampling",
      "description": "Sample 10% of all requests during peak hours",
      "sampleRate": 0.1,
      "target": "all_requests",
      "targetValue": null,
      "enabled": true,
      "priority": 0,
      "createdBy": "admin",
      "createdAt": "2026-08-20T10:00:00Z",
      "updatedAt": "2026-08-20T10:00:00Z"
    }
  ]
}
```

### POST /api/v1/admin/sampling-rules

Create a new sampling rule.

**Headers:**
- `x-api-key`: Admin API key (required)

**Body:**

```json
{
  "name": "Transaction endpoint sampling",
  "description": "Sample 50% of transaction API requests",
  "sampleRate": 0.5,
  "target": "endpoint",
  "targetValue": "/api/v1/transactions",
  "enabled": true,
  "priority": 1
}
```

**Validation:**
- `name`: Required, 1-255 characters
- `sampleRate`: Required, 0.0 to 1.0
- `target`: Required, one of `all_requests` or `endpoint`
- `targetValue`: Required if target is `endpoint`
- `priority`: Optional, defaults to 0

**Response:**

```json
{
  "rule": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Transaction endpoint sampling",
    "description": "Sample 50% of transaction API requests",
    "sampleRate": 0.5,
    "target": "endpoint",
    "targetValue": "/api/v1/transactions",
    "enabled": true,
    "priority": 1,
    "createdBy": "admin",
    "createdAt": "2026-08-26T12:00:00Z",
    "updatedAt": "2026-08-26T12:00:00Z"
  }
}
```

### PATCH /api/v1/admin/sampling-rules/:id

Update an existing sampling rule.

**Headers:**
- `x-api-key`: Admin API key (required)

**Body:**

```json
{
  "sampleRate": 0.25,
  "enabled": false
}
```

**Response:**

```json
{
  "rule": {
    /* updated rule object */
  }
}
```

### DELETE /api/v1/admin/sampling-rules/:id

Delete a sampling rule.

**Headers:**
- `x-api-key`: Admin API key (required)

**Response:**

```json
{
  "message": "Sampling rule deleted"
}
```

## Frontend Admin UI

**Location:** `/admin/sampling-rules`

### Features

1. **Rules Table**
   - Columns: Name, Rate (%), Target, Priority, Status
   - Visual indicators for enabled/disabled state
   - Sample rate displayed as percentage (e.g., 50%)

2. **Create Form**
   - Input validation for sample rate (0-100%)
   - Target type selector
   - Conditional target value input
   - Priority field with default value

3. **Actions**
   - Delete button per rule
   - Toggle enabled state (via PATCH)
   - Refresh button to reload rules

4. **Error Handling**
   - API error display in alert banner
   - Form validation feedback
   - Loading state during API calls

## Usage Examples

### Example 1: Sample 10% of all requests

```bash
curl -X POST http://localhost:3001/api/v1/admin/sampling-rules \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{
    "name": "Global 10% sample",
    "description": "Baseline sampling for all traffic",
    "sampleRate": 0.1,
    "target": "all_requests",
    "enabled": true,
    "priority": 0
  }'
```

### Example 2: Sample 100% of slow analytics endpoints

```bash
curl -X POST http://localhost:3001/api/v1/admin/sampling-rules \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{
    "name": "Full sampling for analytics",
    "description": "Always sample analytics endpoints for observability",
    "sampleRate": 1.0,
    "target": "endpoint",
    "targetValue": "/api/v1/analytics",
    "enabled": true,
    "priority": 1
  }'
```

### Example 3: Disable sampling for health checks

```bash
curl -X POST http://localhost:3001/api/v1/admin/sampling-rules \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_ADMIN_KEY" \
  -d '{
    "name": "No sampling for health checks",
    "description": "Exclude health endpoints from traces",
    "sampleRate": 0.0,
    "target": "endpoint",
    "targetValue": "/health",
    "enabled": true,
    "priority": 10
  }'
```

## Metrics

**Counter:** `sampling_rule_evaluations_total`

Labels:
- `rule_id`: UUID of the rule that matched
- `decision`: `sample` or `skip`

Example Prometheus query:

```promql
# Sample rate by rule
rate(sampling_rule_evaluations_total{decision="sample"}[5m])
/ 
rate(sampling_rule_evaluations_total[5m])

# Total sampled requests
sum(rate(sampling_rule_evaluations_total{decision="sample"}[5m]))
```

## Performance Considerations

### Rule Evaluation Overhead

- Rule evaluation occurs on every HTTP request
- Database query for rules is cached in service singleton
- In-memory rule evaluation is O(n) where n = number of enabled rules
- Keep rule count reasonable (<100 rules)

### Caching Strategy

Rules are loaded once at service initialization and held in memory. To refresh rules:

1. Restart the service, OR
2. Implement a cache invalidation endpoint (future enhancement)

### Best Practices

1. **Use priority carefully**: Higher priority rules are evaluated first
2. **Specific before general**: Place endpoint-specific rules at higher priority than `all_requests` rules
3. **Monitor metrics**: Track sampling decisions to verify rules behave as expected
4. **Test in dev**: Validate regex patterns match expected paths before deploying

## Testing

Run tests:

```bash
# Unit tests
npm test -- requestSampling.service.test.ts

# Integration tests
npm test -- samplingRules.test.ts

# Frontend tests
npm test -- SamplingRules.test.tsx

# E2E tests
npm run test:e2e -- sampling-rules-admin.spec.ts
```

## Future Enhancements

1. **Dynamic rule updates**: Hot-reload rules without service restart
2. **Advanced targeting**: Support for HTTP method, headers, query params
3. **Conditional sampling**: Sample only if response time > threshold
4. **Sampling budget**: Global rate limit across all rules
5. **Time-based rules**: Different rates for peak vs. off-peak hours
6. **A/B testing**: Assign cohorts to different sample rates

## Troubleshooting

### Rules not applying

1. Check rule is `enabled = true`
2. Verify target pattern matches actual request path
3. Check priority ordering — higher priority rules may match first
4. Review metrics: `sampling_rule_evaluations_total{rule_id="..."}`

### High overhead

1. Reduce number of enabled rules
2. Optimize regex patterns in `targetValue`
3. Increase cache TTL for rule lookups (if implemented)

### Unexpected sampling rate

1. Verify `sampleRate` value is correct (0.5 = 50%, not 50)
2. Check for multiple rules matching same endpoint
3. Review fingerprint bucketing — sampling is deterministic per time bucket

