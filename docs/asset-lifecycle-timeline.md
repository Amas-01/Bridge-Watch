# Asset Lifecycle State Timeline

## Overview

The Asset Lifecycle State Timeline feature expands Bridge Watch with tracking and auditing for asset lifecycle state transitions across `INITIALIZED`, `PROVISIONED`, `ACTIVE`, `PAUSED`, `DEPRECATED`, and `RETIRED` states.

## Data Model & Persistence

Transitions are persisted in the `asset_lifecycle_timeline` database table:

- `id` (UUID, primary key)
- `asset_id` (String, asset identifier)
- `asset_symbol` (String, asset ticker)
- `state` (String, target lifecycle state)
- `previous_state` (String, optional previous state)
- `reason` (Text, compliance/operator justification)
- `triggered_by` (String, actor username or service ID)
- `metadata` (JSONB, supplementary context)
- `created_at` / `updated_at` (Timestamps with timezone)

## API Surface

- `POST /api/v1/assets/lifecycle-timeline`: Record a state transition.
- `GET /api/v1/assets/lifecycle-timeline`: List timeline entries with optional `assetId`, `state`, `startDate`, `endDate`, `limit`, and `offset` filters.
- `GET /api/v1/assets/lifecycle-timeline/stats`: Fetch aggregate state metrics and active asset counts.
- `GET /api/v1/assets/lifecycle-timeline/latest/:assetId`: Retrieve the current state for a specific asset.

## Operational Procedures

### Rollout
1. Run Knex migration `20260829000010_asset_lifecycle_state_timeline.ts`.
2. Deploy backend service and register Fastify route handlers.
3. Access UI at `/assets/lifecycle-timeline`.

### Rollback
1. Execute Knex rollback: `npm run migrate:down`.
2. Revert route registration in `asset-routes.ts`.
