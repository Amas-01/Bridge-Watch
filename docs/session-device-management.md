# Session Device Management

## Overview

Session Device Management enables users and security teams to monitor logged-in devices, track client fingerprints and IP addresses, flag trusted devices, and terminate unauthorized active sessions.

## Data Model & Persistence

Stored in `user_session_devices`:

- `id` (UUID, primary key)
- `user_id` (String, account holder identifier)
- `device_fingerprint` (String, browser/device hash)
- `device_name` (String, client description e.g. "Chrome on macOS")
- `device_type` (`DESKTOP` | `MOBILE` | `TABLET` | `OTHER`)
- `ip_address` (String, client IP)
- `location` (String, approximate geographic location)
- `user_agent` (Text, browser user agent string)
- `is_active` (Boolean, active status flag)
- `is_trusted` (Boolean, explicit user trust flag)
- `last_active_at` / `revoked_at` (Timestamps with timezone)

## API Surface

- `POST /api/v1/user/devices/register`: Register or touch active session device.
- `GET /api/v1/user/devices`: List all registered session devices for user.
- `DELETE /api/v1/user/devices/:deviceId`: Revoke single device session.
- `POST /api/v1/user/devices/revoke-others`: Terminate all other active sessions.
- `PATCH /api/v1/user/devices/:deviceId/trust`: Update device trust state.

## Operational Procedures

### Rollout
1. Run Knex migration `20260829000030_session_device_management.ts`.
2. Deploy backend service and routes.
3. Access UI at `/user/devices`.

### Rollback
1. Execute Knex rollback: `npm run migrate:down`.
