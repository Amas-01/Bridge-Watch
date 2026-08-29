# Unit Testing Infrastructure

Unit testing infrastructure is standardized across backend and frontend using Vitest.

## Backend

- Framework: Vitest (`backend/vitest.config.ts`)
- Projects: `unit`, `integration`
- Coverage reporting: text, html, lcov, json-summary
- Coverage thresholds:
  - lines: 60
  - functions: 55
  - branches: 35
  - statements: 60
- Mocking support:
  - global ioredis mocking for unit tests (`tests/setup.ts`)
  - focused test helpers in `tests/helpers/*`

## Frontend

- Framework: Vitest + Testing Library
- Snapshot support in component/page tests
- Coverage thresholds configured in `frontend/vite.config.ts`
- Test setup includes msw handlers and reusable render helpers

## Organization

- Backend: `tests/api`, `tests/services`, `tests/workers`, `tests/jobs`, `tests/integration`
- Frontend: colocated component/page hook tests + `src/test` shared utilities

## CI integration

- CI runs coverage-enabled test commands
- Coverage artifacts are uploaded to Codecov
- Integration workflow separates fast unit feedback from heavier service-backed tests

## Fixture inventory

Reusable test fixtures (JSON payloads, factories, MSW handlers, DB seeds, and contract snapshots) are documented in [FIXTURE_AUDIT_REPORT.md](./FIXTURE_AUDIT_REPORT.md).

## Recommended test pattern

1. Arrange deterministic fixtures/mocks.
2. Act via public API/service methods.
3. Assert result, side effects, and persistence.
4. Clean up state explicitly for isolation.
