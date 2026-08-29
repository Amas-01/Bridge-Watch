# Community Annotation Moderation

## Overview

The Community Annotation Moderation system provides a structured workflow for community members to submit annotations and moderators to review, approve, or reject them.

## API Endpoints

### Submit Annotation for Review
```
POST /api/v1/moderation/{annotationId}/submit-review
```

**Response:**
```json
{
  "id": "annotation-123",
  "status": "pending_review",
  "updated_at": "2026-08-24T19:30:00Z"
}
```

### Moderate Annotation
```
POST /api/v1/moderation/{annotationId}/moderate
```

**Request Body:**
```json
{
  "action": "approve|reject|review",
  "reason": "Optional reason for the action",
  "moderatorId": "moderator-user-id"
}
```

**Response:**
```json
{
  "id": "log-123",
  "annotationId": "annotation-123",
  "action": "approve",
  "moderatorId": "moderator-1",
  "reason": "Valid and well-documented",
  "status": "approved",
  "createdAt": "2026-08-24T19:30:00Z"
}
```

### Get Pending Reviews
```
GET /api/v1/moderation/pending-reviews
```

**Response:**
```json
{
  "reviews": [
    {
      "id": "annotation-123",
      "content": "Annotation content",
      "author": "community-user",
      "created_at": "2026-08-24T19:00:00Z",
      "status": "pending_review",
      "review_count": 0
    }
  ]
}
```

### Get Moderation History
```
GET /api/v1/moderation/{annotationId}/history
```

**Response:**
```json
{
  "history": [
    {
      "id": "log-1",
      "annotationId": "annotation-123",
      "action": "review",
      "moderatorId": "moderator-1",
      "reason": null,
      "status": "pending",
      "createdAt": "2026-08-24T19:00:00Z"
    }
  ]
}
```

### Get Approved Annotations
```
GET /api/v1/moderation/approved?limit=100
```

**Response:**
```json
{
  "approved": [
    {
      "id": "annotation-123",
      "content": "Approved annotation",
      "author": "community-user",
      "moderated_at": "2026-08-24T19:30:00Z"
    }
  ]
}
```

## Data Model

### community_annotations
- `id`: UUID - Primary key
- `content`: TEXT - Annotation content
- `author`: VARCHAR - Author identifier
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP
- `status`: VARCHAR - One of: pending_review, approved, rejected, under_review
- `moderated_at`: TIMESTAMP - When moderated
- `moderator_id`: VARCHAR - ID of moderator
- `review_count`: INTEGER - Number of reviews

### annotation_moderation_logs
- `id`: UUID - Primary key
- `annotation_id`: UUID - Foreign key to community_annotations
- `action`: VARCHAR - One of: approve, reject, review
- `moderator_id`: VARCHAR - Moderator identifier
- `reason`: TEXT - Optional reason
- `status`: VARCHAR - One of: pending, approved, rejected
- `created_at`: TIMESTAMP
- `updated_at`: TIMESTAMP

## Authorization

- Moderator role required for moderation endpoints
- Public read access for approved annotations only
- Authors can view their own annotations

## Error Handling

**400 Bad Request:**
- Invalid action type
- Missing required fields

**404 Not Found:**
- Annotation not found

**403 Forbidden:**
- Insufficient permissions for moderation

**500 Internal Server Error:**
- Database errors

## Observability

### Metrics
- `annotations_submitted_total`: Counter for submissions
- `annotations_approved_total`: Counter for approvals
- `annotations_rejected_total`: Counter for rejections
- `moderation_review_time_seconds`: Histogram for review time

### Logging
- All moderation actions logged with moderator ID
- Audit trail maintained for compliance

## Failure Handling

- **Retry Logic:** Failed moderation operations queued for retry
- **Dead Letter Queue:** Unrecoverable failures stored separately
- **Alerting:** Critical moderation errors trigger alerts

## Migration Path

No breaking changes. New feature is additive and backward compatible.

## Rollout Procedures

1. Create database tables via migration
2. Enable endpoints one at a time
3. Run background jobs for initial data sync
4. Monitor moderation queue

## Support

For issues or questions, contact the moderation team.
