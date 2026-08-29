# API Architecture

Design and structure of the Stellar Bridge Watch backend API.

## Overview

The backend API is built with **Fastify** and follows RESTful conventions with:
- Versioned API paths (`/api/v1/`)
- JSON request/response format
- OpenAPI/Swagger documentation
- WebSocket support for real-time updates

## Route Structure

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/assets` | List all monitored assets |
| `GET` | `/api/v1/assets/:symbol` | Asset detail by symbol |
| `GET` | `/api/v1/assets/:symbol/health` | Current health score |
| `GET` | `/api/v1/assets/:symbol/liquidity` | Aggregated liquidity data |
| `GET` | `/api/v1/assets/:symbol/price` | Current price from all sources |
| `GET` | `/api/v1/bridges` | Bridge status overview |
| `GET` | `/api/v1/bridges/:bridge/stats` | Bridge-specific statistics |
| `GET` | `/api/v1/analytics/*` | Analytics and aggregation |
| `GET` | `/api/v1/metadata/*` | Asset and bridge metadata |
| `WS` | `/api/v1/ws` | WebSocket for real-time updates |

### Health Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Simple alive check |
| `GET` | `/health/live` | Kubernetes liveness probe |
| `GET` | `/health/ready` | Readiness probe (checks dependencies) |
| `GET` | `/health/detailed` | Full system health report |
| `GET` | `/health/metrics` | Prometheus metrics |

### Authenticated Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `*` | `/api/v1/alerts/*` | Alert rule management |
| `*` | `/api/v1/watchlists/*` | Watchlist CRUD |
| `*` | `/api/v1/preferences/*` | User preferences |
| `*` | `/api/v1/api-keys/*` | API key management |

### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `*` | `/api/v1/admin/rate-limit/*` | Rate limit administration |
| `*` | `/api/v1/admin/tracing/*` | Request tracing admin |
| `*` | `/api/v1/admin/validation/*` | Data validation admin |
| `*` | `/api/v1/cache/*` | Cache statistics and control |
| `*` | `/api/v1/circuit-breaker/*` | Circuit breaker status |
| `*` | `/api/v1/jobs/*` | Background job status |

## Middleware Pipeline

Requests pass through the following middleware chain:

```
Request
  │
  ▼
┌─────────────────┐
│ Request Tracing  │  Assigns X-Request-Id, logs entry
└────────┬────────┘
         │
┌────────▼────────┐
│ Rate Limiting    │  Sliding-window per IP/API key
└────────┬────────┘  Returns 429 if exceeded
         │
┌────────▼────────┐
│ Authentication   │  API key validation (optional per route)
└────────┬────────┘  Returns 401 if invalid
         │
┌────────▼────────┐
│ Validation       │  Request schema validation (params, body, query)
└────────┬────────┘  Returns 400 if invalid
         │
┌────────▼────────┐
│ Route Handler    │  Calls service layer
└────────┬────────┘
         │
         ▼
Response (JSON)
```

## Services Layer

Route handlers delegate to a shared services layer:

| Service | Routes Served | Responsibilities |
|---------|--------------|-----------------|
| `asset.service.ts` | `/assets/*` | Asset lookup, metadata, listing |
| `health.service.ts` | `/assets/:symbol/health` | Health score calculation and retrieval |
| `price.service.ts` | `/assets/:symbol/price` | Multi-source price aggregation |
| `liquidity.service.ts` | `/assets/:symbol/liquidity` | DEX liquidity aggregation |
| `bridge.service.ts` | `/bridges/*` | Bridge status, statistics |
| `alert.service.ts` | `/alerts/*` | Alert rule CRUD, event retrieval |
| `analytics.service.ts` | `/analytics/*` | Historical analytics computation |
| `aggregation.service.ts` | `/aggregation/*` | Cross-source data aggregation |
| `watchlists.service.ts` | `/watchlists/*` | User watchlist management |
| `preferences.service.ts` | `/preferences/*` | User preference storage |
| `apiKey.service.ts` | `/api-keys/*` | API key generation and validation |
| `config.service.ts` | `/config/*` | Runtime configuration |
| `circuitBreaker.service.ts` | `/circuit-breaker/*` | Circuit breaker state |
| `healthCheck.service.ts` | `/health/*` | System dependency health |

## Request Validation

Fastify's built-in schema validation is used for all routes. Request schemas are defined in `backend/src/api/validations/` and cover:

- Path parameters (`:symbol`, `:bridge`)
- Query parameters (pagination, filters, time ranges)

See [pagination-guide.md](../pagination-guide.md) for list-endpoint pagination models and examples.
- Request bodies (alert rules, preferences, API key creation)

Invalid requests receive a `400` response with structured error details.

## Error Handling

All errors follow a consistent format:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Asset not found: INVALID"
}
```

| Status Code | Meaning |
|-------------|---------|
| 400 | Bad Request — validation error |
| 401 | Unauthorized — missing or invalid API key |
| 404 | Not Found — resource does not exist |
| 429 | Too Many Requests — rate limit exceeded |
| 500 | Internal Server Error |

## WebSocket Protocol

The WebSocket server (port 3002) supports:

- **Connection:** `ws://host:3002/api/v1/ws`
- **Authentication:** Optional API key in query parameter or header
- **Message format:** JSON
- **Channels:** Clients subscribe to specific asset/bridge update channels
- **Heartbeat:** Server sends periodic ping frames

See [WebSocket Protocol](../../backend/docs/websocket-protocol.md) for the full specification.

## API Documentation

OpenAPI/Swagger documentation is auto-generated:

- **Spec file:** `backend/docs/openapi.json`
- **Generation:** `npm run docs:generate` in the backend directory
- **Swagger UI:** Available at `/docs` when enabled
- **Authentication guide:** [../api-authentication-guide.md](../api-authentication-guide.md)
