# Incident Evidence Annotation Search

## Overview

The Incident Evidence Annotation Search feature provides a comprehensive search and tagging system for incident evidence and annotations, enabling quick discovery of supporting evidence during incident response and investigation.

## API Endpoints

### Search Evidence
```
GET /api/v1/evidence/search?q=bridge&incidentId=INC-123&severity=high&tags=critical,confirmed&dateFrom=2026-08-01&dateTo=2026-08-31
```

**Query Parameters:**
- `q` (optional): Full-text search query
- `incidentId` (optional): Filter by incident
- `severity` (optional): One of: low, medium, high, critical
- `tags` (optional): Comma-separated tags
- `dateFrom` (optional): ISO 8601 date
- `dateTo` (optional): ISO 8601 date

**Response:**
```json
{
  "results": [
    {
      "id": "evidence-123",
      "incidentId": "INC-456",
      "annotationId": "annot-789",
      "content": "Bridge transfer failed at block 12345",
      "author": "analyst-1",
      "severity": "high",
      "tags": ["bridge", "failure", "critical"],
      "createdAt": "2026-08-24T19:00:00Z",
      "relevanceScore": 0.95
    }
  ]
}
```

### Add Evidence Annotation
```
POST /api/v1/evidence/add
```

**Request Body:**
```json
{
  "incidentId": "INC-456",
  "content": "Bridge transfer failure detected",
  "author": "analyst-1",
  "severity": "critical",
  "tags": ["bridge", "failure", "urgent"],
  "evidenceType": "log_entry"
}
```

**Response:**
```json
{
  "id": "evidence-123",
  "incidentId": "INC-456",
  "content": "Bridge transfer failure detected",
  "author": "analyst-1",
  "severity": "critical",
  "tags": ["bridge", "failure", "urgent"],
  "evidenceType": "log_entry",
  "createdAt": "2026-08-24T19:30:00Z",
  "updatedAt": "2026-08-24T19:30:00Z"
}
```

### Get Incident Evidence
```
GET /api/v1/evidence/incidents/{incidentId}
```

**Response:**
```json
{
  "evidence": [
    {
      "id": "evidence-1",
      "incidentId": "INC-456",
      "content": "First piece of evidence",
      "author": "analyst-1",
      "severity": "high",
      "tags": ["bridge"],
      "evidenceType": "log_entry",
      "createdAt": "2026-08-24T19:00:00Z",
      "updatedAt": "2026-08-24T19:00:00Z"
    }
  ]
}
```

### Update Evidence Annotation
```
PATCH /api/v1/evidence/{id}
```

**Request Body:**
```json
{
  "content": "Updated evidence content",
  "severity": "critical",
  "tags": ["bridge", "failure", "confirmed"]
}
```

**Response:**
```json
{
  "id": "evidence-123",
  "incidentId": "INC-456",
  "content": "Updated evidence content",
  "author": "analyst-1",
  "severity": "critical",
  "tags": ["bridge", "failure", "confirmed"],
  "evidenceType": "log_entry",
  "createdAt": "2026-08-24T19:00:00Z",
  "updatedAt": "2026-08-24T19:35:00Z"
}
```

## Data Model

### incident_evidence_annotations
- `id`: UUID - Primary key
- `incident_id`: VARCHAR - Incident identifier
- `annotation_id`: UUID - Related annotation (optional)
- `content`: TEXT - Evidence content
- `author`: VARCHAR - Analyst/author identifier
- `severity`: VARCHAR - One of: low, medium, high, critical
- `tags`: TEXT[] - Array of tags for categorization
- `evidence_type`: VARCHAR - Type of evidence (e.g., log_entry, transaction, report)
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

## Indexing

To support efficient searches:
- GIN index on `tags` for tag-based filtering
- Full-text search index on `content` using English dictionary
- Index on `incident_id` for incident-specific queries
- Index on `created_at` for time-range filtering
- Index on `severity` for severity filtering

## Authorization

- Analysts and incident responders can add evidence
- All users can search and view evidence
- Only evidence authors or admins can update evidence

## Error Handling

**400 Bad Request:**
- Invalid search parameters
- Missing required fields

**404 Not Found:**
- Incident not found
- Evidence annotation not found

**500 Internal Server Error:**
- Database errors
- Search engine errors

## Observability

### Metrics
- `evidence_search_total`: Counter for search queries
- `evidence_search_latency_ms`: Histogram for search latency
- `evidence_added_total`: Counter for new evidence
- `evidence_tags_cardinality`: Gauge for unique tags

### Logging
- All searches logged with parameters
- Search latency tracked
- Failed searches logged with error details

## Full-Text Search

The search endpoint supports PostgreSQL full-text search capabilities:
- Case-insensitive matching
- Partial word matching with `%` wildcards
- Boolean operators (AND/OR) supported
- Stemming via English dictionary

## Search Best Practices

1. Use specific keywords for targeted searches
2. Leverage severity filters to prioritize critical evidence
3. Use tags for categorization and filtering
4. Combine incident ID with other filters for precise results

## Failure Handling

- **Search Failures:** Fallback to basic keyword matching
- **Index Corruption:** Automatic index rebuild triggered
- **Timeout:** Long-running searches timeout after 30 seconds

## Migration Path

No breaking changes. Feature is additive and backward compatible.

## Rollout Procedures

1. Create database tables and indexes
2. Enable search endpoints
3. Backfill existing incident data if available
4. Monitor search latency and success rates
5. Collect usage metrics

## Rollback Procedures

1. Disable search endpoints
2. Retain database tables (no data loss)
3. Revert deployment

## Performance Considerations

- Searches limited to 100 results per query
- Pagination supported via limit/offset
- Full-text indexes optimized for common searches
- Connection pooling for database efficiency

## Support

For search issues or feature requests, contact the incident response team.
