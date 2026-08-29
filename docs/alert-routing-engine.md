# Alert Routing Engine

The alert routing engine dispatches triggered alerts to notification channels using rule-based routing, user channel preferences, and suppression logic.

## Routing Inputs

- Alert severity (`critical`, `high`, `medium`, `low`)
- Asset code (for asset-specific routing and muted asset checks)
- Source type (`alert_type` from evaluated rule conditions)
- Owner preferences (`alerts.defaultSeverity`, `alerts.channels`, `alerts.mutedAssets`)
- Admin routing rules (`alert_routing_rules`)

## Dispatch Flow

1. Alert is emitted by alert evaluation and persisted in `alert_events`.
2. Routing engine loads owner preferences and active routing rules (owner-specific + global).
3. Alert is suppressed if:
   - Asset is muted for that owner, or
   - Alert severity is below owner `defaultSeverity`.
4. First matching active routing rule (lowest `priority_order`) is selected.
5. Primary channels are dispatched.
6. If no primary dispatch succeeds, fallback channels are attempted.
7. Every suppression/dispatch attempt is written to `alert_routing_audit`.

## Matching Rules

A routing rule matches when all configured filters pass:

- `severity_levels` includes alert severity (or empty to match all)
- `asset_codes` includes asset (or empty to match all)
- `source_types` includes source type (or empty to match all)

## Suppression Windows

- `suppression_window_seconds` applies per owner + asset + source + channel.
- If a recent queued/delivered/fallback entry exists within the window, dispatch is suppressed and audited.

## Channels

Supported channels:

- `in_app`: published immediately to the WebSocket alerts Redis channel for low-latency delivery
- `webhook`: queued through webhook endpoints (with retry/backoff via BullMQ); falls back to rule webhook URL when available
- `email`: uses email notification service when owner identifier is an email address

## Retry Handling

Webhook retry/backoff is provided by the existing webhook queue worker.

- Delivery queue: `webhook-delivery`
- Exponential retry policy managed by `WebhookService` and worker listeners
- Delivery-level audit remains in webhook delivery tables; routing decisions are recorded in `alert_routing_audit`

## Admin API

All routes require an admin API key (`admin:api-keys` scope):

- `GET /api/v1/admin/alert-routing/rules`
- `POST /api/v1/admin/alert-routing/rules`
- `PATCH /api/v1/admin/alert-routing/rules/:id`
- `DELETE /api/v1/admin/alert-routing/rules/:id`
- `GET /api/v1/admin/alert-routing/audit`

## UI

Admin page:

- `GET /admin/alert-routing`
- Create/activate/delete routing rules
- View recent routing audit outcomes
