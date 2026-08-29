# External Dependency Monitor

Bridge Watch now tracks upstream dependency availability, latency, maintenance state, and recent heartbeat history.

## Covered Providers

- Stellar Horizon
- Soroban RPC
- CoinGecko
- Optional EVM RPC endpoints when configured:
  - Ethereum RPC
  - Polygon RPC
  - Base RPC

## What Is Stored

- dependency inventory and thresholds in `external_dependencies`
- heartbeat history in `external_dependency_checks`
- latest latency, last success/failure, and consecutive failure count per provider
- maintenance mode and maintenance note per provider

## Runtime Behavior

- scheduled checks run every 2 minutes in the shared BullMQ worker loop
- manual checks are available through `POST /api/v1/external-dependencies/checks/run`
- maintenance mode can be toggled through `PATCH /api/v1/external-dependencies/:providerKey/maintenance`
- dashboard display reads from `GET /api/v1/external-dependencies`

## Threshold Model

Each provider stores:

- warning latency
- critical latency
- failure alert threshold

Status rules:

- `healthy`: request succeeds inside warning latency
- `degraded`: request succeeds but is slow or returns a non-5xx error response
- `down`: request fails, returns 5xx, or breaches the critical latency threshold
- `maintenance`: provider intentionally suppressed from alerting

## Failure Alerts

When a provider remains non-healthy for at least its configured consecutive failure threshold, the service marks the check as `alert_triggered` and logs an alert event for operators.
