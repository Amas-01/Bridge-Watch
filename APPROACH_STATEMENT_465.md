# Approach Statement — Issue #465: Build Alert Ownership Matrix

## Codebase Analysis Summary

### Backend Framework & Stack
- **Framework**: Fastify 5.8.4 with TypeScript
- **Database**: PostgreSQL 15+ with TimescaleDB extension
- **ORM/Query Builder**: Knex 3.1.0
- **Validation**: Zod 3.23.8
- **Testing**: Vitest 2.1.5
- **Node Version**: 20+

### Service/Controller/Repository Pattern
- **Service Layer**: Class-based services with dependency injection via constructor
- **Controller Layer**: Fastify route handlers with schema validation
- **Database Access**: Direct Knex queries via `getDatabase()` singleton
- **Transaction Pattern**: `db.transaction(async (trx) => { ... })` for multi-table writes
- **Error Handling**: Services throw errors; controllers catch and return appropriate HTTP status codes

### Alert Data Model
- **Alert Identifier**: UUID (`alert_rules.id`)
- **Foreign Key Type**: UUID with `gen_random_uuid()` default
- **Owner Model**: Currently `owner_address` (string) in `alert_rules` table
- **Naming Convention**: snake_case for database columns, camelCase for TypeScript

### Existing Audit Pattern
- **Table**: `audit_logs` (migration 013)
- **Structure**: Generic audit log with `action`, `actor_id`, `actor_type`, `resource_type`, `resource_id`, `before`, `after`, `metadata`, `severity`, `checksum`, `created_at`
- **Append-Only**: No update or delete operations on audit logs
- **Tamper Detection**: SHA-256 checksum computed from entry fields
- **Pattern**: Will reuse this existing audit log table rather than creating a new ownership-specific audit table

### Export Pattern
- **Formats**: CSV and JSON (PDF exists but not commonly used)
- **Library**: `csv-stringify` for CSV generation
- **Streaming**: Supported via `JSONStream` for large datasets
- **Response Headers**: `Content-Type` and `Content-Disposition` headers set appropriately
- **Pattern**: Direct streaming in route handlers for smaller datasets; async job queue for large exports

### Search Pattern
- **Implementation**: Database-level LIKE queries with ILIKE for case-insensitive search
- **Pattern**: `db.where('column', 'ilike', `%${query}%`)` or `db.whereRaw("column ILIKE ?", [`%${query}%`])`
- **No Full-Text Search**: No existing pg_trgm or ts_vector usage found

### Authentication & Authorization
- **Middleware**: `authMiddleware()` from `backend/src/api/middleware/auth.ts`
- **API Key**: Validated via `x-api-key` header
- **Scopes**: Optional `requiredScopes` array (e.g., `["admin:audit"]`)
- **User Identity**: Stored in `request.apiKeyAuth` after validation
- **Pattern**: Apply middleware via `preHandler` hook or `server.addHook("preHandler", authMiddleware())`

### Testing Framework
- **Unit Tests**: Vitest with mocked services
- **Integration Tests**: Vitest with real database (PostgreSQL test instance)
- **Test Database**: `bridge_watch_test` database in CI
- **Mocking**: `vi.mock()` for service dependencies
- **HTTP Testing**: `server.inject()` for route testing
- **Coverage**: Vitest coverage via `--coverage` flag

### CI Requirements (from `.github/workflows/ci.yml`)
1. **Lint**: `npm --workspace=backend run lint` (ESLint, zero errors)
2. **Build**: `npm --workspace=backend run build` (TypeScript compilation)
3. **Migrations**: `npm --workspace=backend run migrate` (all migrations apply cleanly)
4. **Tests**: `npm --workspace=backend run test -- --coverage` (all tests pass)
5. **Coverage**: Uploaded to Codecov (no minimum threshold enforced in CI, but 90% target for new code)

## Implementation Plan

### 1. Ownership Data Model

Based on reconnaissance, the ownership model will support:
- **Single owner per alert**: One user or team owns each alert (enforced by unique constraint on `alert_id`)
- **Owner type**: Enum distinguishing `user` vs `team` ownership
- **Owner ID**: String type (consistent with `owner_address` pattern in existing `alert_rules`)

**Rationale**: The existing `alert_rules` table uses `owner_address` (string), suggesting a wallet-address-based ownership model. The ownership matrix will follow this pattern.

### 2. Database Schema

#### Migration: `027_alert_ownership_matrix.ts`

**Tables**:

1. **`alert_ownership`**
   - `id` — UUID, primary key, `gen_random_uuid()`
   - `alert_id` — UUID, foreign key to `alert_rules.id`, unique constraint
   - `owner_type` — ENUM (`user`, `team`)
   - `owner_id` — VARCHAR(255), the user wallet address or team identifier
   - `created_at` — TIMESTAMP, `knex.fn.now()`
   - `created_by` — VARCHAR(255), actor who assigned ownership
   - Index: `(alert_id)`, `(owner_id)`, `(owner_type, owner_id)`

2. **`escalation_contacts`**
   - `id` — UUID, primary key, `gen_random_uuid()`
   - `alert_id` — UUID, foreign key to `alert_rules.id`
   - `contact_user_id` — VARCHAR(255), user identifier for escalation
   - `order` — INTEGER, escalation sequence (1, 2, 3, ...)
   - `created_at` — TIMESTAMP, `knex.fn.now()`
   - `created_by` — VARCHAR(255), actor who added contact
   - Unique constraint: `(alert_id, contact_user_id)`
   - Index: `(alert_id, order)`

**Audit Log**: Will reuse existing `audit_logs` table with:
- `action`: `alert.ownership_assigned`, `alert.ownership_transferred`, `alert.escalation_added`, `alert.escalation_removed`
- `resource_type`: `alert_ownership` or `escalation_contact`
- `resource_id`: `alert_id`
- `before`/`after`: JSON snapshots of ownership state
- `actor_id`: User performing the action
- `actor_type`: `user` or `api_key`

### 3. Ownership Matrix Service

**File**: `backend/src/services/ownershipMatrix.service.ts`

**Methods**:

- `assignOwner(alertId, ownerId, ownerType, actorId)` — Creates or updates ownership; writes audit log; validates alert exists
- `getOwner(alertId)` — Returns current owner record
- `getOwnershipMatrix(filters: { teamId?, ownerId?, alertId? }, pagination)` — Returns filtered ownership matrix with pagination
- `addEscalationContact(alertId, contactUserId, order, actorId)` — Adds escalation contact; writes audit log
- `getEscalationContacts(alertId)` — Returns escalation contacts ordered by `order` ASC
- `removeEscalationContact(alertId, contactUserId, actorId)` — Removes contact; writes audit log
- `getAuditHistory(alertId, pagination)` — Queries `audit_logs` filtered by `resource_id = alertId` and `resource_type IN ('alert_ownership', 'escalation_contact')`, ordered by `created_at DESC`
- `exportOwnershipMatrix(format: 'csv' | 'json', filters)` — Exports filtered matrix; CSV uses `csv-stringify`; JSON returns same shape as `getOwnershipMatrix`
- `searchOwnership(query: string, pagination)` — ILIKE search across `alert_rules.name`, `alert_ownership.owner_id`, and joined team names (if team table exists)

**Transaction Usage**: All multi-table writes (assign + audit, add contact + audit) wrapped in `db.transaction()`

**Error Handling**: Throw descriptive errors; controllers map to HTTP status codes

### 4. Management Endpoints

**File**: `backend/src/api/routes/ownershipMatrix.ts`

**Routes**:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/alerts/:alertId/ownership` | admin or current owner | Assign/transfer owner |
| GET | `/alerts/:alertId/ownership` | authenticated | Get current owner |
| GET | `/ownership/matrix` | authenticated | Get full matrix (filtered, paginated) |
| POST | `/alerts/:alertId/escalation` | admin or current owner | Add escalation contact |
| GET | `/alerts/:alertId/escalation` | authenticated | Get escalation contacts |
| DELETE | `/alerts/:alertId/escalation/:contactId` | admin or current owner | Remove escalation contact |
| GET | `/alerts/:alertId/ownership/history` | authenticated | Get audit history (paginated) |
| GET | `/ownership/export` | admin | Export matrix (query params: `format`, filters) |
| GET | `/ownership/search` | authenticated | Search ownership (query param: `q`, pagination) |

**Validation**: Zod schemas in `backend/src/api/validations/ownershipMatrix.schema.ts`

**Authentication**: 
- All endpoints require `authMiddleware()`
- Admin-only endpoints: `authMiddleware({ requiredScopes: ["admin:ownership"] })`
- Owner-check endpoints: Service validates `actorId` matches current owner or has admin scope

### 5. Team-Based Grouping

`getOwnershipMatrix` will accept an optional `groupBy: 'team'` parameter. When set:
- Response shape: `{ teams: [{ teamId, teamName, alerts: [...] }] }`
- Implementation: SQL `GROUP BY owner_id WHERE owner_type = 'team'`

### 6. Documentation

**File**: `backend/docs/alert-ownership-matrix.md`

**Sections**:
- Overview
- Ownership Workflow (assign, transfer, escalate)
- API Endpoints (with examples)
- Audit History Semantics (append-only, tamper detection)
- Export Formats (CSV columns, JSON structure)
- Search Behavior (ILIKE, searchable fields)
- Authentication Requirements (per endpoint)

### 7. Tests

**Service Tests** (`backend/tests/services/ownershipMatrix.service.test.ts`):
- `assignOwner` creates ownership record and audit log entry
- `assignOwner` on already-owned alert records previous owner in audit log (transfer)
- `assignOwner` rejects invalid `alertId`
- `addEscalationContact` adds contact at correct order
- `getEscalationContacts` returns contacts in ascending order
- `getAuditHistory` returns entries in reverse chronological order
- `exportOwnershipMatrix` CSV output includes correct headers and all rows
- `exportOwnershipMatrix` JSON output matches `getOwnershipMatrix` shape
- `searchOwnership` returns results matching alert name, owner name, and team name

**Controller Tests** (`backend/tests/api/ownershipMatrix.test.ts`):
- Every endpoint returns 401 for unauthenticated requests
- Every endpoint returns 400 for malformed requests
- Transfer endpoint correctly updates ownership and audit log
- Export endpoint streams CSV content with correct `Content-Type` header
- Search endpoint returns paginated results
- Audit history immutability: Assert no endpoint allows modification or deletion of audit log entries

**Coverage Target**: 90% for new code paths (service and controller)

### 8. CI Checks (Local Verification Before PR)

1. **Type-check**: `npm --workspace=backend run build` (zero errors)
2. **Lint**: `npm --workspace=backend run lint` (zero errors)
3. **Migrations**: `npm --workspace=backend run migrate` (clean test database)
4. **Tests**: `npm --workspace=backend run test -- --coverage` (all pass, 90%+ coverage)
5. **Migration Validation**: `npm --workspace=backend run migrate:validate` (if available)

### 9. Security & PII

- **Owner IDs**: Never logged at production level (use `logger.debug()` if needed)
- **Audit Log**: Append-only enforced at service layer (no update/delete methods)
- **Export Endpoint**: Admin-restricted via `requiredScopes: ["admin:ownership"]`
- **Ownership Verification**: All modify endpoints verify `actorId` matches current owner or has admin scope

### 10. Files to Create

1. `backend/src/database/migrations/027_alert_ownership_matrix.ts`
2. `backend/src/services/ownershipMatrix.service.ts`
3. `backend/src/api/routes/ownershipMatrix.ts`
4. `backend/src/api/validations/ownershipMatrix.schema.ts`
5. `backend/tests/services/ownershipMatrix.service.test.ts`
6. `backend/tests/api/ownershipMatrix.test.ts`
7. `backend/docs/alert-ownership-matrix.md`

### 11. Files to Modify

1. `backend/src/api/routes/index.ts` — Register `ownershipMatrix` routes
2. `backend/src/services/audit.service.ts` — Add new audit action types (if not already generic)

### 12. Unresolved Questions

1. **Team Data Model**: Does a `teams` table exist? If not, `owner_type = 'team'` will store team identifiers as strings without FK constraint. Search will be limited to `owner_id` ILIKE.
2. **Admin Scope Definition**: What scope string should be used for admin checks? Assuming `admin:ownership` based on existing `admin:audit` pattern.
3. **Escalation Contact Ordering**: Should reordering existing contacts be supported, or only add/remove? Assuming add/remove only for MVP.
4. **Export Size Limits**: Should large exports use async job queue (like `export.service.ts`)? Assuming direct streaming for MVP (ownership matrix expected to be <10k rows).

## Summary

This implementation follows all existing patterns in the Bridge-Watch codebase:
- Knex migrations with UUID primary keys and snake_case columns
- Class-based services with transaction-wrapped multi-table writes
- Fastify routes with Zod validation and `authMiddleware()`
- Reuses existing `audit_logs` table (append-only, tamper-proof)
- CSV export via `csv-stringify`, JSON export as direct response
- ILIKE-based search following existing search patterns
- Vitest tests with mocked services and `server.inject()` for routes
- All CI checks (lint, build, migrate, test) will pass before PR

**Branch**: `feature/backend-alert-ownership`  
**Closes**: #465
