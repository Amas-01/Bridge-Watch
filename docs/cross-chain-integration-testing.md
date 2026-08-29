# Cross-Chain Integration Testing

Setup and usage guide for the cross-chain integration test suite.

## Overview

The suite at `backend/tests/integration/cross-chain/` covers:

| Area | What is tested |
|---|---|
| Contract interactions | Bridge status endpoint, asset health, reserve verification shape |
| Event propagation | Health checks publishing results, Prometheus metrics emission |
| State synchronization | Supply mismatch detection, Redis caching across requests |
| Failure scenarios | Single source down, all sources down, unhandled 500s |
| Timeout handling | Slow upstream fetch, recovery after transient timeout |

## Prerequisites

- Docker (for Postgres + Redis test containers) **or** local instances
- Node 20+

## Running the tests

```bash
# From the repo root
docker compose -f docker-compose.dev.yml up -d postgres redis

# Run only cross-chain integration tests
cd backend
npx vitest run tests/integration/cross-chain

# Run the full integration suite
npx vitest run tests/integration
```

## Environment variables

The integration setup (`tests/integration/setup.ts`) sets these defaults:

| Variable | Default |
|---|---|
| `POSTGRES_HOST` | `localhost` |
| `POSTGRES_PORT` | `5432` |
| `POSTGRES_DB` | `bridge_watch_test` |
| `POSTGRES_USER` | `bridge_watch` |
| `POSTGRES_PASSWORD` | `test_password` |
| `REDIS_HOST` | `localhost` |
| `REDIS_PORT` | `6379` |

Override any of these via environment or a `.env.test` file.

## Test structure

```
backend/tests/integration/cross-chain/
└── cross-chain.integration.test.ts   # Main suite (5 describe blocks)
```

Each `describe` block is independent — `beforeEach` flushes Redis and external API mocks are restored after each test via `afterEach`.

## Mocking strategy

External HTTP calls (Ethereum RPC, Stellar Horizon) are intercepted via `mockExternalApis()` from `tests/helpers/externalApiMock.ts`. This stubs `global.fetch` with a response sequence, avoiding real network calls while still exercising the full service layer.

To add a new failure scenario, extend the mock sequence:

```typescript
mockExternalApis([
  { ok: true, status: 200 },   // Stellar Horizon — OK
  { ok: false, status: 503 },  // Ethereum RPC — unavailable
]);
```
