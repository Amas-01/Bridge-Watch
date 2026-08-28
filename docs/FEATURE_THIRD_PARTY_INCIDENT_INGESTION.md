# Third-Party Incident Status Ingestion

## Overview

This feature enables Bridge Watch to automatically ingest and track incidents from third-party status pages and monitoring systems. It provides a unified view of incidents affecting bridge operations, external dependencies, and connected chains.

## API Contract

### Endpoints

#### GET /api/v1/incidents

Retrieve all tracked incidents

**Query Parameters:**

- `status` (optional): Filter by status (investigating, identified, monitoring, resolved)
- `severity` (optional): Filter by severity (minor, major, critical)
- `source` (optional): Filter by source
- `limit` (optional): Number of results (default: 50)
- `offset` (optional): Pagination offset

**Response:**

```json
{
  "incidents": [
    {
      "id": "uuid",
      "source": "statuspage",
      "external_id": "incident-123",
      "title": "API Degradation",
      "description": "Increased latency on API endpoints",
      "status": "monitoring",
      "severity": "major",
      "affected_component": "API Gateway",
      "incident_started_at": "2026-08-26T10:00:00Z",
      "incident_resolved_at": null,
      "created_at": "2026-08-26T10:05:00Z",
      "updated_at": "2026-08-26T11:00:00Z"
    }
  ],
  "total": 100,
  "limit": 50,
  "offset": 0
}
```

#### GET /api/v1/incidents/:id

Get a specific incident with all status updates

**Response:**

```json
{
  "incident": {
    "id": "uuid",
    "source": "statuspage",
    "title": "API Degradation",
    "status": "monitoring",
    "updates": [
      {
        "status": "monitoring",
        "message": "Issue has been identified and is being monitored",
        "update_timestamp": "2026-08-26T11:00:00Z"
      }
    ]
  }
}
```

#### POST /api/v1/incidents/sources

Register a new incident ingestion source (Admin only)

**Request Body:**

```json
{
  "source_name": "Stellar StatusPage",
  "source_type": "statuspage",
  "api_endpoint": "https://status.stellar.org/api/v2",
  "auth_type": "api_key",
  "credentials": {
    "api_key": "encrypted_key_here"
  },
  "poll_interval_seconds": 300,
  "config": {
    "components_to_watch": ["API", "Horizon", "Soroban RPC"]
  }
}
```

#### PUT /api/v1/incidents/sources/:id

Update an incident ingestion source (Admin only)

#### DELETE /api/v1/incidents/sources/:id

Remove an incident ingestion source (Admin only)

## Data Model

### Tables

#### `third_party_incidents`

Stores incident records from external sources

#### `incident_status_updates`

Tracks all status changes for each incident

#### `incident_ingestion_sources`

Configuration for third-party incident sources

## Persistence Contract

### Data Retention

- Active incidents: Retained indefinitely
- Resolved incidents: Retained for 90 days
- Status updates: Retained with their parent incident

### Archival

- Incidents older than 90 days after resolution are archived to cold storage
- Archived data can be retrieved via separate archival API

## Authorization

- `GET /api/v1/incidents*`: Public (rate-limited)
- `POST/PUT/DELETE /api/v1/incidents/sources*`: Admin role required
- Internal ingestion workers: Service account with `ingestion:write` permission

## Failure Handling

### Ingestion Failures

- Failed API calls are retried with exponential backoff (1min, 2min, 5min, 10min)
- After 4 failures, source is marked as unhealthy and alerts are sent
- Manual intervention required to re-enable after 10 consecutive failures

### Data Validation Failures

- Invalid incident data is logged and skipped
- Validation errors are tracked and reported in metrics
- Schema mismatches trigger alerts to operations team

### Network Failures

- Temporary network issues are handled with retry logic
- Circuit breaker pattern prevents cascading failures
- Fallback to cached data for read operations

## Retry Logic

```typescript
const retryConfig = {
  maxAttempts: 4,
  initialDelay: 60000, // 1 minute
  maxDelay: 600000, // 10 minutes
  backoffMultiplier: 2,
  retryableErrors: [
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "429",
    "500",
    "502",
    "503",
  ],
};
```

## Observability

### Metrics

- `incidents_ingested_total`: Counter of successfully ingested incidents
- `incidents_ingestion_errors_total`: Counter of ingestion failures by source
- `incidents_active_by_severity`: Gauge of active incidents by severity level
- `incident_source_health`: Gauge (0-1) of source health status
- `incident_ingestion_duration_seconds`: Histogram of ingestion operation duration

### Logs

- All ingestion operations are logged with correlation IDs
- Failed ingestions include full context (source, error, payload)
- Audit log for all source configuration changes

### Traces

- Distributed tracing for ingestion workflow
- Trace spans: fetch → validate → transform → persist → notify

### Alerts

- `IncidentSourceUnhealthy`: Source failed 4+ consecutive polls
- `HighSeverityIncidentDetected`: Critical incident ingested
- `IncidentIngestionStalled`: No successful ingestion in 30 minutes

## Migration Path

### Database Migration

```bash
npm run migrate:up
```

This creates:

- `third_party_incidents` table
- `incident_status_updates` table
- `incident_ingestion_sources` table
- Required indexes for query performance

### Rollback

```bash
npm run migrate:rollback
```

Safely removes all incident ingestion tables.

### Existing Consumer Compatibility

- This is a new feature with no existing consumers
- All endpoints are versioned under `/api/v1/incidents`
- Future API changes will use `/api/v2/incidents` to maintain compatibility

## Testing

### Unit Tests

Location: `backend/tests/unit/services/incidentIngestion.test.ts`

Coverage:

- Incident data parsing and validation
- Status update creation
- Source configuration management
- Error handling and retry logic

### Integration Tests

Location: `backend/tests/integration/incidentIngestion.test.ts`

Coverage:

- End-to-end ingestion workflow
- Database operations
- External API mocking
- Notification triggers

### End-to-End Tests

Location: `e2e/tests/incident-management.spec.ts`

Coverage:

- UI displays active incidents
- Admin can configure sources
- Real-time incident updates via WebSocket

## Operational Documentation

### Rollout Procedure

1. **Pre-deployment Checks**
   - Verify database migration in staging environment
   - Confirm API credentials for incident sources
   - Review alert configuration

2. **Deployment Steps**

   ```bash
   # Run migration
   npm run migrate:up

   # Deploy backend with feature flag disabled
   FEATURE_INCIDENT_INGESTION=false npm run deploy

   # Verify deployment health
   curl https://api.bridgewatch.io/health

   # Enable feature flag gradually
   # 10% traffic
   FEATURE_INCIDENT_INGESTION_ROLLOUT=10 npm run config:update

   # Monitor for 1 hour, then increase to 50%, then 100%
   ```

3. **Post-deployment Validation**
   - Verify incidents are being ingested
   - Check metrics dashboard for errors
   - Test admin source configuration UI

### Rollback Procedure

1. **Immediate Rollback** (if critical issues detected)

   ```bash
   # Disable feature flag
   FEATURE_INCIDENT_INGESTION=false npm run config:update

   # Stop ingestion workers
   npm run worker:stop incident-ingestion
   ```

2. **Full Rollback** (if database issues)

   ```bash
   # Revert to previous deployment
   npm run deploy:rollback

   # Rollback migration
   npm run migrate:rollback
   ```

3. **Verification**
   - Confirm ingestion workers are stopped
   - Verify no new incidents are being created
   - Check that existing endpoints still function

### Support Procedures

#### Common Issues

**Issue: Source continuously failing**

- Check source credentials validity
- Verify API endpoint is reachable
- Review source configuration for correctness
- Check rate limiting on source API

**Issue: Incidents not appearing in UI**

- Verify ingestion worker is running
- Check worker logs for errors
- Confirm WebSocket connections are established
- Review incident filtering logic

**Issue: Duplicate incidents**

- Check `source` + `external_id` uniqueness constraint
- Review source polling interval (may be too frequent)
- Verify deduplication logic in ingestion service

#### Troubleshooting Commands

```bash
# Check ingestion worker status
npm run worker:status incident-ingestion

# View recent ingestion logs
npm run logs:tail incident-ingestion

# Manually trigger ingestion for a source
npm run worker:trigger incident-ingestion --source=<source_id>

# Check source health
curl https://api.bridgewatch.io/api/v1/admin/incidents/sources/health
```

#### Monitoring Dashboard

Access: https://grafana.bridgewatch.io/d/incident-ingestion

Key Panels:

- Ingestion rate by source
- Error rate and types
- Active incidents by severity
- Source health status
- Ingestion latency

## Security Considerations

- All API credentials are encrypted at rest using AES-256
- Credentials are decrypted only in memory during use
- Admin endpoints require authentication + admin role
- Rate limiting prevents abuse of public endpoints
- Audit logging tracks all configuration changes

## Performance Considerations

- Ingestion workers run independently per source
- Database indexes optimize common query patterns
- Caching layer reduces database load for frequently accessed incidents
- WebSocket updates use pub/sub to minimize database polling

## Future Enhancements

- Machine learning-based incident severity prediction
- Automatic correlation of incidents across sources
- Incident impact prediction on bridge operations
- Integration with PagerDuty, Opsgenie for alerting
- Historical incident analytics and trends
