# Admin Impersonation Safeguards

## Overview

Admin Impersonation Safeguards provide time-bounded, audited user impersonation capabilities for support and compliance personnel. Mandatory justification tickets, active session banners, token hashes, and strict request logging ensure zero unauthorized administrative access.

## Data Model & Persistence

Stored in `admin_impersonation_sessions` and `admin_impersonation_audit_logs`:

### `admin_impersonation_sessions`
- `id` (UUID, primary key)
- `admin_id` (String, admin account)
- `impersonated_user_id` (String, target account)
- `reason` (Text, mandatory justification)
- `approval_ticket_id` (String, ticket reference e.g. "SUP-101")
- `status` (`ACTIVE` | `ENDED` | `REVOKED` | `EXPIRED`)
- `token_hash` (String, SHA-256 session token hash)
- `max_duration_minutes` (Integer, default 30)
- `expires_at` / `ended_at` (Timestamps with timezone)

### `admin_impersonation_audit_logs`
- `id` (UUID, primary key)
- `impersonation_session_id` (UUID, session reference)
- `admin_id` / `impersonated_user_id` (Strings)
- `action_performed` / `request_path` / `request_method` (HTTP request details)
- `timestamp` (Timestamp with timezone)

## API Surface

- `POST /api/v1/admin/impersonation/start`: Initiate impersonation session.
- `POST /api/v1/admin/impersonation/stop`: Terminate active session.
- `GET /api/v1/admin/impersonation/sessions`: Query impersonation session history.
- `GET /api/v1/admin/impersonation/audit-logs`: Fetch detailed audit logs for a session.

## Operational Procedures

### Rollout
1. Run Knex migration `20260829000040_admin_impersonation_safeguards.ts`.
2. Deploy backend service and routes.
3. Access UI at `/admin/impersonation-safeguards`.

### Rollback
1. Execute Knex rollback: `npm run migrate:down`.
