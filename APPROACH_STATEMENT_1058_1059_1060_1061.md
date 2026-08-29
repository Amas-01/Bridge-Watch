# Approach Statement — Request Sampling Controls, Structured Error Catalog, Operational Change Approval Workflow, and Config Rollback Preview
## Issues: #1058 #1059 #1060 #1061

This document records all design decisions derived exclusively from reading the actual codebase.

---

## Reconnaissance Summary

- **ORM/Migration tool**: Knex (`knex ^3.1.0`). No Prisma directory exists. Migrations live in `backend/src/database/migrations/`. New migrations use the `YYYYMMDD_<slug>.ts` date-prefix naming convention matching the most recent files (`20260824_canary_metric_comparison.ts`, `20260824_rollback_readiness_checks.ts`).
- **Primary key pattern**: UUID via `table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))` — used consistently in newer migrations (013, 20260824 files). bigIncrements used only in specific cases (023_config_service.ts).
- **Timestamp pattern**: Explicit `table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())` and `updated_at` matching the same pattern.
- **Soft-delete**: `is_active` boolean (e.g. `feature_flags`, `assets`, `bridges` tables).
- **HTTP framework**: Fastify v5. Routes are async functions receiving a `FastifyInstance` and registered via `server.register(fn, { prefix: '/api/v1/...' })`.
- **Auth middleware**: `authMiddleware({ requiredScopes: ['admin:<scope>'] })` from `backend/src/api/middleware/auth.ts`, used as `preHandler`. Authenticated identity is `request.apiKeyAuth?.name ?? 'admin'` and `request.apiKeyAuth?.id`.
- **Service pattern**: Singleton class with `static instance` and `getInstance()`. All DB access through `getDatabase()`. Logger is `pino` via `import { logger } from '../utils/logger.js'`; call signature `logger.info({ field }, 'message')`.
- **Metrics**: `prom-client` via `getMetricsService()` singleton in `metrics.service.ts`. New counters are added as class properties initialized in `initializeMetrics()`.
- **Audit**: `AuditService.getInstance().log({ action, actorId, resourceType, resourceId, ... })`.
- **Admin route registration**: `backend/src/api/routes/route-groups/admin-routes.ts` — all four new route sets must be imported and registered here.
- **Config history**: `023_config_service.ts` creates `configs` (bigIncrements id, environment, key, value jsonb) and `config_audits` (config_id FK, old_value, new_value, changed_by, change_reason). No standalone `config_versions` table exists — must create one.
- **Notification infrastructure**: No standalone push/email notification service for admin workflow events was found. Change approval status transitions will emit `logger.info` with structured fields.
- **Frontend**: React 18, React Router v6, Tailwind with `stellar-*` CSS custom properties (dark theme). Admin pages follow the `AlertRoutingAdmin.tsx` / `ApiKeys.tsx` pattern: direct `fetch` via `fetchApi()` in `services/api.ts`, `useState` for loading/error/data, custom HTML tables (no DataTable wrapper). `Modal` component from `components/Modal/Modal.tsx`. Routes added as lazy imports in `App.tsx` and wired under the `<Layout />` route group.
- **Backend tests**: Vitest, files in `backend/tests/services/` and `backend/tests/api/`. Service tests mock `../../src/database/connection.js` and `../../src/utils/logger.js`. API tests use `Fastify()` + `server.inject()`.
- **Frontend tests**: Vitest + React Testing Library + MSW (msw v2). Test files colocated at `src/**/*.test.tsx`. Setup at `frontend/src/test/setup.ts`.
- **E2E tests**: Playwright in `e2e/tests/*.spec.ts`, using `page.route()` for API mocking and `mockCoreApi` utility.

---

## #1058 — Request Sampling Controls

**Data model**: A `sampling_rules` table with UUID PK, `name` (unique), `description`, `sample_rate` (decimal 0.0–1.0), `target` (string enum: `all_requests`, `endpoint_pattern`, `client_id`), `target_value` (nullable), `enabled` boolean, `priority` integer, `created_by` string, `created_at`/`updated_at` timestamps. Indexes on `(enabled, priority)` and `target_value`.

**Sampling decision**: `shouldSampleRequest()` in `RequestSamplingService` fetches all enabled rules ordered by priority ascending. For each rule, it checks whether the request matches the rule's target (all/endpoint pattern/client id). For the first matching rule, it applies deterministic sampling using a hash of `request.id` (Fastify assigns a request ID) modulo 100 compared against `sample_rate * 100`. This ensures the same request ID always returns the same decision. Returns `true` (sample) or `false` (skip).

**Middleware**: `requestSamplingMiddleware` (Fastify `preHandler` hook, registered globally on the server or per-route group) calls `shouldSampleRequest()` and writes the result to `request.samplingDecision` for downstream consumption by logging and expensive analytics operations.

**API**: `GET|POST /api/v1/admin/sampling-rules`, `PATCH|DELETE /api/v1/admin/sampling-rules/:id`, `GET /api/v1/admin/sampling-rules/evaluate`. All admin-scoped (`admin:sampling`).

**UI**: `frontend/src/pages/admin/SamplingRules.tsx` — follows `AlertRoutingAdmin.tsx` pattern. Table of rules, inline create form with a numeric `sample_rate` input (0–100%), enable/disable toggle, delete. Error/loading/empty states in stellar-* theme.

---

## #1059 — Structured Error Catalog

**Data model**: An `error_catalog` table with UUID PK, `error_code` (unique, e.g. `BRIDGE_TIMEOUT`), `title`, `message_template` (e.g. `"Operation failed after {retries} retries"`), `http_status` integer, `severity` (string: `info|warning|error|critical`), `category` (string: `network|auth|validation|bridge|rate_limit|internal`), `retry_guidance` nullable text, `documentation_url` nullable, `is_active` boolean default true, `created_by`, `updated_by`, `created_at`, `updated_at`.

**Integration with existing error handling**: Additive only. The `enrichError(errorCode, params)` method looks up the catalog entry and substitutes `{param}` placeholders in `message_template`. No existing error handler is modified — callers explicitly call `enrichError()` when they want catalog-enriched responses.

**API**: `GET|POST /api/v1/admin/error-catalog`, `PATCH|DELETE /api/v1/admin/error-catalog/:id`, `GET /api/v1/error-catalog/:errorCode` (authenticated, not admin-only — read-only lookup for callers resolving error details).

**UI**: `frontend/src/pages/admin/ErrorCatalog.tsx` — filterable table grouped by category. Severity shown as colored inline badge (critical=red, error=orange, warning=yellow, info=blue). Create/edit modal. Deactivate (soft delete) button.

---

## #1060 — Operational Change Approval Workflow

**Data model**: A `change_requests` table with UUID PK, `title`, `description`, `change_type` (string: `config_update|rule_change|sampling_update|other`), `payload` jsonb (the serialized proposed change), `status` (string: `draft|pending_approval|approved|rejected|applied|cancelled`), `submitted_by`, `submitted_at` (nullable), `reviewed_by` (nullable), `reviewed_at` (nullable), `review_comment` (nullable), `applied_at` (nullable), `created_at`, `updated_at`. Indexes on `(status, submitted_at DESC)` and `submitted_by`.

**State machine**: Transitions strictly enforced in service:
- `draft` → `pending_approval` (submitForApproval — submitter must be creator)
- `pending_approval` → `approved` (approve — reviewer must differ from submitter: four-eyes)
- `pending_approval` → `rejected` (reject — comment required)
- `approved` → `applied` (applyChange — wraps in db transaction)
- `draft|pending_approval` → `cancelled` (cancel — creator or admin only)

**Four-eyes**: `approve()` compares `request.submitted_by !== reviewedBy`. If equal, throws with HTTP 403.

**Notification**: No push/email notification infrastructure found. Every transition logs at `logger.info` with structured fields: `{ feature: 'change_approval', action: transition, actor: actorId, resource_id: requestId, new_status }`. This is documented in the PR description.

**API**: `GET|POST /api/v1/admin/change-requests`, `GET /api/v1/admin/change-requests/:id`, `POST /api/v1/admin/change-requests/:id/submit|approve|reject|apply|cancel`. All `admin:change-requests` scope.

**UI**: `frontend/src/pages/admin/ChangeRequests.tsx` — tabbed view by status (All/Draft/Pending/Approved/Rejected/Applied). Status badges with themed colors. Create form modal. Approve/reject panel with comment field for pending requests. JSON payload preview in `<pre>` block.

---

## #1061 — Config Rollback Preview

**Config version storage**: No standalone `config_versions` table exists (the existing `configs` + `config_audits` tables serve a different purpose — they track changes to operational config keys by environment). A new `config_versions` table is created: UUID PK, `config_key` (not null), `version_number` (integer, composite unique on `(config_key, version_number)`), `payload` jsonb (full config state), `change_summary` nullable text, `applied_by` string, `applied_at` timestamp, `is_current` boolean.

**Diff format**: `previewRollback()` computes a field-by-field diff between `currentVersion.payload` and `targetVersion.payload`. Returns `{ configKey, currentVersion, targetVersion, diff: FieldDiff[], impactSummary }` where each `FieldDiff` has `{ field, currentValue, targetValue, changeType: 'modified'|'added'|'removed' }`.

**Rollback apply**: `applyRollback()` inserts a **new** version record (version_number = max + 1) with the target payload, sets `is_current = true` on the new record, and sets `is_current = false` on the previous current. History is never overwritten.

**Integration with #1060**: Rollback can optionally require an approved change request. This is controlled by a boolean env var `REQUIRE_APPROVAL_FOR_ROLLBACK` (default `false`). If true, `POST /api/v1/admin/config-versions/:configKey/rollback/:targetVersion` body accepts an optional `changeRequestId`. If `REQUIRE_APPROVAL_FOR_ROLLBACK=true` and no approved change request id is provided, the endpoint returns 422. Documented in PR description.

**API**: `GET /api/v1/admin/config-versions/:configKey`, `GET /api/v1/admin/config-versions/:configKey/current`, `GET /api/v1/admin/config-versions/:configKey/rollback-preview/:targetVersion`, `POST /api/v1/admin/config-versions/:configKey/rollback/:targetVersion`. All `admin:config-versions` scope.

**UI**: `frontend/src/pages/admin/ConfigRollback.tsx` — left panel: version history timeline (list of versions with version number, applied_by, applied_at, is_current badge). Right panel: diff view when a target version is selected. Diff shows field-by-field table with `modified` (yellow), `added` (green), `removed` (red) row styling. Impact summary above diff. "Rollback" button triggers the apply endpoint (creates a new version). If approval is required, "Create Change Request" button shown instead.

---

## Migration ordering

All four migrations are independent and use YYYYMMDD timestamp prefix ordered on the same day (20260826):
1. `20260826_create_sampling_rules.ts`
2. `20260826_create_error_catalog.ts`
3. `20260826_create_change_requests.ts`
4. `20260826_create_config_versions.ts`

No cross-table foreign keys exist between these four tables.

---

## Backward compatibility

All changes are purely additive. No existing table, route, or frontend page is modified in a breaking way. The error catalog enrichment is opt-in — no existing error handler is altered.
