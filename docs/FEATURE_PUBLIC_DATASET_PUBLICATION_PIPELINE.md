# Public Dataset Publication Pipeline

## Overview

The Public Dataset Publication Pipeline enables Bridge Watch to publish aggregated bridge, liquidity, and analytics data as public datasets for community use and external integrations.

## API Endpoints

### Register Dataset
```
POST /api/v1/datasets/register
```

**Request Body:**
```json
{
  "name": "Bridge Statistics 2026",
  "description": "Aggregated bridge TVL and transaction volume",
  "category": "bridge-analytics",
  "accessLevel": "public"
}
```

**Response:**
```json
{
  "id": "dataset-123",
  "name": "Bridge Statistics 2026",
  "description": "Aggregated bridge TVL and transaction volume",
  "category": "bridge-analytics",
  "version": "1.0.0",
  "isPublic": false,
  "accessLevel": "public"
}
```

### Publish Dataset
```
POST /api/v1/datasets/{datasetId}/publish
```

**Response:**
```json
{
  "id": "job-123",
  "datasetId": "dataset-123",
  "status": "pending",
  "retryCount": 0
}
```

### Get Public Datasets
```
GET /api/v1/datasets/public?limit=50&offset=0
```

**Response:**
```json
{
  "datasets": [
    {
      "id": "dataset-123",
      "name": "Bridge Statistics 2026",
      "description": "Aggregated bridge TVL and transaction volume",
      "category": "bridge-analytics",
      "version": "1.0.0",
      "isPublic": true,
      "publishedAt": "2026-08-24T19:30:00Z",
      "accessLevel": "public"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

### Get Dataset Details
```
GET /api/v1/datasets/{datasetId}
```

**Response:**
```json
{
  "id": "dataset-123",
  "name": "Bridge Statistics 2026",
  "description": "Aggregated data",
  "category": "bridge-analytics",
  "version": "1.0.0",
  "is_public": true,
  "published_at": "2026-08-24T19:30:00Z",
  "access_level": "public"
}
```

### Retry Failed Publications
```
POST /api/v1/datasets/retry-failed
```

**Response:**
```json
{
  "retriedCount": 3
}
```

## Data Model

### public_datasets
- `id`: UUID - Primary key
- `name`: VARCHAR - Dataset name
- `description`: TEXT - Dataset description
- `category`: VARCHAR - Category classification
- `version`: VARCHAR - Semantic version
- `is_public`: BOOLEAN - Publication status
- `access_level`: VARCHAR - One of: public, restricted, internal
- `published_at`: TIMESTAMP - Publication timestamp
- `expires_at`: TIMESTAMP - Expiration date (optional)
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

### publication_jobs
- `id`: UUID - Primary key
- `dataset_id`: UUID - Foreign key to public_datasets
- `status`: VARCHAR - One of: pending, in_progress, completed, failed
- `published_at`: TIMESTAMP - When published
- `failure_reason`: TEXT - Reason for failure
- `retry_count`: INTEGER - Number of retry attempts
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

## Authorization

- Admin access required to register and publish datasets
- Public read access for published datasets
- Restricted datasets require authentication

## Error Handling

**400 Bad Request:**
- Missing required fields
- Invalid access level

**404 Not Found:**
- Dataset not found

**409 Conflict:**
- Dataset already published

**500 Internal Server Error:**
- Publication pipeline errors

## Observability

### Metrics
- `datasets_registered_total`: Counter for registrations
- `datasets_published_total`: Counter for publications
- `publication_job_duration_seconds`: Histogram for publication time
- `publication_job_failures_total`: Counter for failures

### Logging
- All publication events logged
- Failure details captured for debugging
- Audit trail maintained

## Publication Pipeline

1. **Registration:** Dataset metadata registered
2. **Validation:** Dataset content validated
3. **Aggregation:** Data aggregated and normalized
4. **Publishing:** Dataset published to public access
5. **Archival:** Old versions archived after expiration

## Failure Handling

- **Automatic Retry:** Failed publications retry up to 3 times
- **Exponential Backoff:** Retry delays increase exponentially
- **Dead Letter Queue:** Unrecoverable failures stored for manual review
- **Alerting:** Critical failures trigger alerts

## Migration Path

No breaking changes. New feature is additive and backward compatible.

## Rollout Procedures

1. Create database tables via migration
2. Deploy publication job workers
3. Enable endpoints
4. Monitor publication queue and success rates
5. Configure dataset expiration policies

## Rollback Procedures

1. Stop accepting new publication requests
2. Complete in-flight publications
3. Maintain published datasets
4. Disable endpoints gracefully

## Support

For issues or dataset queries, contact the data team.
