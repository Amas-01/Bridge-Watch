# API Changelog Diff Viewer

## Overview

The API Changelog Diff Viewer provides a structured way to view differences between API versions, track changes over time, and generate migration guides automatically.

## API Endpoints

### Get Diff Between Versions
```
GET /api/v1/changelog/diff?from=1.0.0&to=1.1.0
```

**Parameters:**
- `from` (required): Source version
- `to` (required): Target version

**Response:**
```json
{
  "fromVersion": "1.0.0",
  "toVersion": "1.1.0",
  "addedFeatures": [
    "Asset Metadata Versioning: New versioning API for asset metadata"
  ],
  "removedFeatures": [],
  "breakingChanges": [],
  "deprecated": [],
  "timestamp": "2026-08-24T19:30:00Z"
}
```

### Get All Versions
```
GET /api/v1/changelog/versions
```

**Response:**
```json
{
  "versions": [
    {
      "version": "1.5.0",
      "releaseDate": "2026-05-29T00:00:00Z",
      "changes": ["Frozen Asset Controls", "State Export Functions"],
      "breaking": false
    }
  ]
}
```

### Get Version Details
```
GET /api/v1/changelog/versions/{version}
```

**Response:**
```json
{
  "id": "uuid",
  "version": "1.5.0",
  "release_date": "2026-05-29T00:00:00Z",
  "changes": ["Array of change descriptions"],
  "is_breaking": false
}
```

## Data Model

### api_changelog
- `id`: UUID - Primary key
- `version`: VARCHAR - Semantic version (e.g., "1.5.0")
- `release_date`: TIMESTAMP - Release date
- `changes`: TEXT[] - Array of change descriptions
- `is_breaking`: BOOLEAN - Indicates breaking changes
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

### api_changelog_details
- `id`: UUID - Primary key
- `version_id`: UUID - Foreign key to api_changelog
- `feature`: VARCHAR - Feature name
- `change_type`: VARCHAR - One of: added, removed, modified, deprecated, fixed
- `description`: TEXT - Detailed description
- `is_breaking`: BOOLEAN - Indicates breaking change
- `created_at`: TIMESTAMP

## Authorization

- Public read access for all endpoints
- Admin access required to update changelog

## Error Handling

**400 Bad Request:**
- Missing required parameters
- Invalid version format

**404 Not Found:**
- Version not found

**500 Internal Server Error:**
- Database connection issues

## Observability

### Metrics
- `changelog_diff_queries_total`: Counter for diff queries
- `changelog_diff_query_duration_ms`: Histogram for query latency
- `changelog_version_fetch_errors_total`: Counter for fetch errors

### Logging
All queries logged with:
- Request parameters
- Response timing
- Error details

## Migration Path

No breaking changes. All endpoints are additive and backward compatible.

## Rollout Procedures

1. Deploy migration scripts
2. Populate api_changelog table with historical versions
3. Enable endpoints in reverse order (versions first, then diff)
4. Monitor error rates

## Rollback Procedures

1. Disable endpoints at API gateway
2. Retain database tables (no data loss)
3. Revert deployment

## Support

For issues, contact the Bridge Watch team or open an issue on GitHub.
