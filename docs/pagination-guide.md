# Pagination Guide

How list endpoints paginate in the Bridge Watch REST API (`/api/v1/`).

## Overview

Bridge Watch uses **three pagination models**. Always read the endpoint you integrate with — parameter names and response shapes are not fully standardized yet.

| Model | When to use | Query/body params | Typical response fields |
|-------|-------------|-------------------|-------------------------|
| **Page + limit** | Most dashboard lists | `page`, `limit` or `pageSize` | `page`, `limit`/`pageSize`, `total`, `totalPages` |
| **Offset + limit** | Admin/audit feeds | `limit`, `offset` | `total`, sometimes `hasMore` |
| **Cursor (Horizon)** | Stellar transaction fetch/backfill | `cursor`, `pageSize`/`maxPages` in JSON body | Horizon paging tokens (not SQL offset) |

Shared helper: [`backend/src/utils/pagination.ts`](../backend/src/utils/pagination.ts).

## Shared page/limit helper

Used by routes that call `getPaginationParams()`:

- Default `page`: `1`
- Default `limit`: `50`
- Maximum `limit`: `100`
- `offset` = `(page - 1) * limit` unless `offset` is supplied explicitly

Response wrapper from `formatPaginatedResponse()`:

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 50,
    "totalPages": 0
  }
}
```

Zod defaults live in [`backend/src/api/validations/common.schema.ts`](../backend/src/api/validations/common.schema.ts) (`limit` default 20, max 100).

## Endpoint reference

### Page + limit (meta wrapper)

| Endpoint | Params | Notes |
|----------|--------|-------|
| `GET /api/v1/alerts/history` | `page`, `limit` | Returns `{ data, meta }` via `formatPaginatedResponse` |

### Page + pageSize (flat response)

| Endpoint | Params | Response shape |
|----------|--------|----------------|
| `GET /api/v1/transactions` | `page` (default 1), `pageSize` (default 10, max 100) | `{ transactions, total, page, pageSize, totalPages }` |
| `GET /api/v1/exports?userId=` | `page`, `limit` | `{ exports, length, total, page, limit, totalPages }` |
| Alert history search (service) | `page`, `pageSize` (default 50, max 500) | `{ results, total, page, pageSize, totalPages }` |

### Offset + limit

| Endpoint | Params | Response shape |
|----------|--------|----------------|
| `GET /api/v1/incidents` | `limit` (default 50), `offset` | `{ incidents, total }` |
| `GET /api/v1/admin/outbox/pending` | `limit`, `offset`, optional `eventType` | `{ events, total, hasMore }` |
| `GET /api/v1/config/features/audit` | `limit` (default 100, max 500), `offset` | Audit search payload |
| `GET /api/v1/audit` | `limit`, `offset` | Audit log entries |

### Limit-only (no page metadata)

Several list routes accept only `limit` with endpoint-specific caps, for example metadata sync history (`limit` max 200) and reconciliation queries (`limit` max 500). Check the route schema in Swagger (`/docs`) when integrating.

### Cursor pagination (Horizon)

Used when reading Stellar/Horizon data — **not** interchangeable with SQL-style `page`/`offset`.

| Endpoint | Body/query | Notes |
|----------|------------|-------|
| `POST /api/v1/transactions/fetch` | `cursor`, `pageSize`, `maxPages` | Horizon paging token |
| `POST /api/v1/transactions/backfill` | `cursor`, `pages` | Historical backfill |

See [`backend/docs/data-model.md`](../backend/docs/data-model.md) (`paging_token`) and [`checkpoint-format.md`](./checkpoint-format.md) for stream checkpoint semantics.

## Examples

### Alerts history (page + limit)

```bash
curl -H "x-api-key: $API_KEY" \
  "http://localhost:3000/api/v1/alerts/history?page=1&limit=25"
```

### Incidents (offset + limit)

```bash
curl "http://localhost:3000/api/v1/incidents?limit=20&offset=40"
```

### Transactions (page + pageSize)

```bash
curl "http://localhost:3000/api/v1/transactions?page=2&pageSize=25"
```

## Best practices

1. **Start small** — use low `limit`/`pageSize` on dashboards; raise only for exports.
2. **Stop when `totalPages` or `hasMore` is false** — do not guess page counts.
3. **Handle rate limits** — on `429`, honor the `Retry-After` header (see [API.md](../backend/docs/API.md)).
4. **Do not mix cursor and offset** — Horizon `cursor` values are opaque tokens, not row offsets.
5. **Pin `/api/v1/`** — version prefix is required; breaking changes get a new prefix with 90-day overlap.

## Common pitfalls

| Pitfall | Detail |
|---------|--------|
| `limit` vs `pageSize` | Same concept, different names on different routes |
| Flat vs wrapped responses | Some routes return `{ data, meta }`, others embed pagination fields at the top level |
| Different caps | Defaults vary (10, 20, 50, 100, 500) per endpoint |
| Assuming uniform `{ items, total }` | Example in `api-usage-examples.md` is illustrative, not universal |

## Version notes

- All REST routes are under `/api/v1/`.
- Breaking pagination changes will be announced in [`API_CHANGELOG.md`](./API_CHANGELOG.md).
- Deprecated versions remain available for at least **90 days** after a replacement ships.

## Related documents

- [backend/docs/API.md](../backend/docs/API.md)
- [backend/docs/api-usage-examples.md](../backend/docs/api-usage-examples.md)
- [architecture/api-architecture.md](./architecture/api-architecture.md)
