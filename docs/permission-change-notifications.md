# Permission Change Notifications

## Overview

Permission Change Notifications provide automated alerts and user inbox notifications when roles or permissions are assigned, revoked, granted, or altered.

## Data Model & Persistence

Notifications are stored in `permission_change_notifications`:

- `id` (UUID, primary key)
- `target_user_id` (String, recipient user)
- `actor_id` (String, administrator or process initiating change)
- `action` (`ROLE_ASSIGNED` | `ROLE_REVOKED` | `PERMISSION_GRANTED` | `PERMISSION_REVOKED`)
- `permission_or_role` (String, modified role/permission key)
- `channels` (JSONB, array of channels e.g. `["IN_APP"]`)
- `status` (`PENDING` | `SENT` | `FAILED`)
- `details` (JSONB, supplementary event context)
- `read_at` (Timestamp, set when acknowledged)
- `created_at` / `updated_at` (Timestamps with timezone)

## API Surface

- `POST /api/v1/notifications/permission-changes`: Dispatch a permission notification.
- `GET /api/v1/notifications/permission-changes`: Fetch notification stream for recipient.
- `PATCH /api/v1/notifications/permission-changes/:id/read`: Mark notification as read.
- `GET /api/v1/notifications/permission-changes/stats`: Get delivery and action statistics.

## Operational Procedures

### Rollout
1. Run Knex migration `20260829000020_permission_change_notifications.ts`.
2. Deploy service and Fastify routes.
3. Access UI at `/notifications/permission-changes`.

### Rollback
1. Execute Knex rollback: `npm run migrate:down`.
