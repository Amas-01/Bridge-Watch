# External Source Response Archive (#1162)

Bridge Watch derives price, supply, and attestation data from third-party
sources (CoinGecko, CoinMarketCap, Circle, Horizon, EVM RPC providers). When a
derived value is later disputed — a price spike, a reserve mismatch, a
reconciliation break — the raw upstream response is normally gone, and all that
survives is the parsed number we stored.

The **External Source Response Archive** captures that raw response: which
source and endpoint, the request shape, the transport outcome, and the body
itself (hashed, size-capped, and with obvious secrets redacted). Operators query
it to trace a value back to exactly what the source returned at collection time.

## Behaviour

### Inputs — `record(input)`

Collectors call `externalSourceResponseArchiveService.record()` after every
upstream call. Archival is **best-effort**: `record()` never throws into the
collector and returns `null` on failure.

| Field | Type | Notes |
|-------|------|-------|
| `sourceKey` | string | Logical source, e.g. `coingecko` |
| `endpoint` | string | Operation within the source, e.g. `simple/price` |
| `method` | string | Request method, default `GET` |
| `requestParams` | object | Query/body params; credential-looking keys are redacted before storage |
| `statusCode` | number \| null | HTTP status, if a response was received |
| `latencyMs` | number \| null | Round-trip time |
| `errorKind` | `"timeout"` \| `"transport"` \| null | Set when no HTTP response came back |
| `errorMessage` | string \| null | Truncated to 1000 chars |
| `responseBody` | string \| null | Archived body (see size cap below) |
| `contentType` | string \| null | |
| `collectionRunId` | string \| null | Correlates to the job/run that made the call |
| `subject` | string \| null | Asset/entity the request was about (lookup key) |
| `retentionDays` | number \| null | Overrides the source default; `null` = legal hold (never expires) |
| `collectedAt` | Date | Defaults to now |

### Outputs

`outcome` is a coarse classification derived from the transport result:

| `outcome` | Condition |
|-----------|-----------|
| `ok` | status 2xx/3xx |
| `client_error` | status 4xx |
| `server_error` | status 5xx |
| `timeout` | `errorKind: "timeout"` |
| `transport_error` | `errorKind: "transport"`, or no status at all |

Body handling:

- The full body is hashed (`sha256`) **before** truncation, so two captures
  remain comparable even when both are truncated. `body_hash` and `body_bytes`
  (original size) are always stored.
- Bodies larger than `EXTERNAL_SOURCE_ARCHIVE_MAX_BODY_BYTES` (default 256 KiB)
  are clipped on a UTF-8 boundary and flagged with `body_truncated = true`.

### Compatibility

- Additive migration; no existing table is altered. The feature is inert until
  a collector calls `record()`.
- `EXTERNAL_SOURCE_ARCHIVE_ENABLED=false` makes `record()` a no-op without
  disabling the read API, so an operator can still inspect what was already
  captured.
- The API lives under the existing `/api/v1/sources` tree and reuses the
  existing `archive:read` / `admin:config` scopes — no new scope to provision.

## API

Mounted at `/api/v1/sources/response-archive`.

| Method & path | Scope | Purpose |
|---------------|-------|---------|
| `GET /` | `archive:read` | List responses. Filters: `sourceKey`, `subject`, `outcome`, `collectionRunId`, `from`, `to`. Paging: `limit` (≤200), `cursor` (opaque `collectedAt`). Returns `{ items, nextCursor }`. |
| `GET /stats` | `archive:read` | Aggregate counts by source and outcome, oldest row, and `expiredPending`. Optional `?sourceKey=`. |
| `GET /:id` | `archive:read` | One response, **metadata only** (body omitted — it can be large). |
| `GET /:id/body` | `archive:read` | The archived body plus `contentType`, `bodyHash`, `bodyBytes`, `bodyTruncated`. |
| `PATCH /:id/retention` | `admin:config` | `{ "retentionDays": null }` places a legal hold; `{ "retentionDays": 30 }` restores a horizon relative to `collectedAt`. |
| `POST /prune` | `admin:config` | Run a retention sweep immediately. Returns `{ deleted }`. |

### Failure handling

- Unauthenticated → `401`; wrong scope → `403`.
- Invalid query/body (bad `outcome`, out-of-range `retentionDays`, unparseable
  dates) → `400` with a Zod `details` payload.
- Unknown `:id` → `404`.

## Persistence

Table `external_source_responses` (migration
`20260828110000_external_source_response_archive.ts`):

- Indexes: `(source_key, subject, collected_at)` for value lookup,
  `(source_key, outcome, collected_at)` for failure triage, `(collection_run_id)`
  for run tracing, `(expires_at)` for the retention sweep.
- CHECK constraints pin `outcome` to the enum and forbid negative
  `latency_ms` / `body_bytes`.
- `expires_at IS NULL` means "keep indefinitely" (legal hold).

## Observability

Custom metrics (via `getMetricsService()`):

| Metric | Labels | Meaning |
|--------|--------|---------|
| `external_source_responses_archived_total` | `source`, `outcome` | Captures written |
| `external_source_responses_pruned_total` | — | Rows deleted by retention |

`record()` failures log at `error` with `sourceKey` / `endpoint`. Prune runs log
the deleted count at `info`.

## Operational controls

| Env var | Default | Effect |
|---------|---------|--------|
| `EXTERNAL_SOURCE_ARCHIVE_ENABLED` | `true` | Master switch for `record()` |
| `EXTERNAL_SOURCE_ARCHIVE_RETENTION_DAYS` | `30` | Default retention horizon |
| `EXTERNAL_SOURCE_ARCHIVE_MAX_BODY_BYTES` | `262144` | Stored body cap |
| `EXTERNAL_SOURCE_ARCHIVE_PRUNE_BATCH` | `500` | Rows deleted per prune batch (keeps locks short) |

Scheduled job `external-source-archive-retention` runs daily at **02:30 UTC**
(registered in `src/workers/index.ts`). It deletes only rows past `expires_at`;
legal holds are never touched.

## Rollout

1. Deploy. The migration runs automatically via `npm run migrate`.
2. Confirm `GET /api/v1/sources/response-archive/stats` returns `{"total":0,...}`
   with an `archive:read` key.
3. Leave `EXTERNAL_SOURCE_ARCHIVE_ENABLED=true`. Collectors begin populating the
   archive as they are updated to call `record()`; until then the table stays
   empty and the API simply returns nothing.
4. Verify the retention job appears in the scheduler logs
   (`Scheduled job system initialized`) and that a manual `POST /prune`
   returns `{"deleted":0}`.

## Rollback

- **Disable without data loss:** set `EXTERNAL_SOURCE_ARCHIVE_ENABLED=false` and
  redeploy. `record()` becomes a no-op; existing rows remain queryable.
- **Full rollback:** `npm run migrate:down` drops `external_source_responses`
  (one migration batch). Remove the `external-source-archive-retention` entry if
  running a pinned worker build. No other table is affected.

## Operator workflow — tracing a disputed value

1. Open **Admin → External Source Response Archive**
   (`/admin/external-source-archive`), or call the API directly.
2. Filter by `sourceKey` and `subject` (the asset code), narrowing with
   `from`/`to` around the time the disputed value was recorded.
3. Click a row to see the sanitised request params and fetch the raw body.
   Check `body_truncated` / `body_hash` if the body looks incomplete.
4. If the response is evidence for an open incident, use **Place legal hold**
   (`PATCH /:id/retention` with `retentionDays: null`) so the retention job
   cannot delete it. **Release hold** restores the normal horizon once the
   incident is closed.
