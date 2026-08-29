# Graceful Shutdown Drain Protocol

## Overview

The Graceful Shutdown Drain Protocol guarantees safe node teardown and maintenance transition across Bridge Watch instances. When a node receives an OS signal (`SIGTERM`, `SIGINT`) or an administrative trigger, the drain protocol halts incoming mutating API calls, gracefully drains WebSocket frames, pauses background workers (BullMQ queues, Horizon streams, webhook dispatchers), and waits for in-flight tasks to complete before exiting.

---

## Drain Lifecycle States

```
  +--------+       Trigger Drain        +----------+       Tasks Completed       +----------+
  | ACTIVE | -------------------------> | DRAINING | -------------------------> | DRAINED  |
  +--------+                            +----------+                            +----------+
      ^                                      |                                        |
      |             Cancel Drain             |          Timeout / Force Expiry        v
      +--------------------------------------+ <-------------------------------- + FAILED   |
                                                                                +----------+
```

1. **`ACTIVE`**: Node is operating normally.
2. **`DRAINING`**: Ingestion queues paused, WS server draining, mutating HTTP requests rejected with HTTP 503 (`Retry-After: 30`).
3. **`DRAINED`**: All in-flight requests and connections have cleanly drained. Ready for process exit.
4. **`CANCELLED`**: Active drain was aborted by an operator; normal traffic resumes.
5. **`FAILED`**: Force shutdown was executed or timeout expired before all tasks finished.

---

## Data Model & Migration

Database table: `shutdown_drain_sessions`
- `id` (UUID, Primary Key)
- `node_id` (String)
- `state` (`ACTIVE` | `DRAINING` | `DRAINED` | `CANCELLED` | `FAILED`)
- `drain_mode` (`graceful` | `force` | `read_only`)
- `reason` (String)
- `initiated_by` (String)
- `timeout_seconds` (Integer)
- `pending_jobs_count` (Integer)
- `active_connections_count` (Integer)
- `active_streams_count` (Integer)
- `started_at` / `drained_at` / `cancelled_at` (Timestamps)

Database table: `shutdown_drain_logs`
- Audit trail for drain protocol events (`DRAIN_INITIATED`, `JOBS_PAUSED`, `WS_DRAINED`, `DRAIN_COMPLETED`, `DRAIN_CANCELLED`, `FORCE_SHUTDOWN`).

---

## Operational Control API

### Initiate Drain Session
```http
POST /api/v1/admin/shutdown/drain/start
Content-Type: application/json
Authorization: Bearer <admin-token>

{
  "timeoutSeconds": 30,
  "reason": "Scheduled node maintenance",
  "mode": "graceful"
}
```

### Check Drain Status
```http
GET /api/v1/admin/shutdown/drain/status
```

### Cancel Drain Session
```http
POST /api/v1/admin/shutdown/drain/cancel
Authorization: Bearer <admin-token>

{
  "cancelledBy": "operator-alice"
}
```

### Force Immediate Shutdown
```http
POST /api/v1/admin/shutdown/drain/force
Authorization: Bearer <admin-token>

{
  "reason": "Emergency node replacement"
}
```

---

## Observability

- **`bridge_watch_drain_status`**: Prometheus gauge (0 = ACTIVE, 1 = DRAINING, 2 = DRAINED, 3 = CANCELLED, 4 = FAILED).
- **`bridge_watch_drain_in_flight_requests`**: Current in-flight HTTP request counter.
- **`bridge_watch_drain_events_total`**: Counter metric tracking drain lifecycle events.
