# Approach Statement: RPC Discovery, Allowlist Review, Decimal Detection, and Export Quotas

## Issue References
- #1082: RPC Method Capability Discovery
- #1083: Contract Address Allowlist Change Review  
- #1085: Token Decimal Change Detection
- #1055: User-Scoped Export Quotas

## Reconnaissance Summary

### Database Stack
- **ORM**: Knex.js with PostgreSQL + TimescaleDB
- **Migration tool**: Knex migrations (`npm run migrate`)
- **Naming**: `###_snake_case_description.ts` (e.g., `048_rpc_method_capabilities.ts`)
- **Primary keys**: `UUID` with `gen_random_uuid()` default
- **Timestamps**: `created_at`, `updated_at` using Knex `.timestamps(true, true)`
- **Pattern**: Hypertables use `time TIMESTAMPTZ` for partitioning; regular tables use UUID primary keys
- **No soft deletes**: Hard deletes with cascades where needed

### API Stack
- **Framework**: Fastify
- **Auth middleware**: `authMiddleware({ requiredScopes: [...] })` from `backend/src/api/middleware/auth.ts`
- **Admin scopes**: `admin:audit`, `admin:config`, etc.
- **Response pattern**: Direct object return or `reply.status(code).send(object)`
- **Error shape**: `{ error: string }` or `{ error: string, message: string }`
- **Route pattern**: Functions exported as `async function <name>Routes(server: FastifyInstance)`
- **Rate limiting**: `@fastify/rate-limit` in route config

### Service Layer
- **Pattern**: Classes with instance or singleton methods
- **Transaction handling**: Knex transactions via `getDatabase()`
- **Not-found convention**: Return `null` or throw `Error("Resource not found")`
- **Logging**: `logger` from `backend/src/utils/logger.js` (pino)

### Job Scheduler
- **Queue**: BullMQ with Redis
- **Pattern**: Singleton `Queue` instances exported from `backend/src/jobs/*.job.ts`
- **Job methods**: `.add(jobName, payload, options)`
- **Example**: `exportQueue.add("process-export", payload, { attempts: 3, ... })`

### Frontend Stack
- **Framework**: React 18 with TypeScript
- **Styling**: TailwindCSS utility classes
- **State**: `useLocalStorageState` for persistence; `@tanstack/react-query` for server state (seen in imports)
- **Forms**: Controlled components with state hooks
- **Tables**: Custom styled `<div>` grids or manual table markup
- **Modal pattern**: Not observed; likely custom components
- **Admin pages**: Under `frontend/src/pages/admin/`

### Test Framework
- **Backend**: Vitest with setup in `backend/tests/setup.ts`
- **Mocking**: `vi.mock` for database, Redis, BullMQ
- **Database mocking**: Query builder chain mocks returning Promises
- **Seeding**: Factories in `backend/tests/factories/`
- **Auth mocking**: Mock `request.apiKeyAuth` object
- **File naming**: `*.test.ts` or `*.test.tsx`

### Environment Variables
- All new vars must be added to `.env.example` with comments
- Sensitive vars use placeholder pattern: `${VAR_NAME_PLACEHOLDER}`

### Git Workflow
- **Branch naming**: `feat/<description>` for features
- **Commit format**: Conventional Commits (`feat(scope): description`)
- **PR requirements**: Link issues with `Closes #123`

---

## Feature 1: RPC Method Capability Discovery (#1082)

### Data Model
**Migration**: `048_rpc_method_capabilities.ts`

Table: `rpc_method_capabilities`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `rpc_endpoint_url` TEXT NOT NULL (stores the full RPC URL)
- `method_name` TEXT NOT NULL
- `is_supported` BOOLEAN NOT NULL
- `discovered_at` TIMESTAMPTZ NOT NULL
- `last_checked_at` TIMESTAMPTZ NOT NULL
- `response_schema` JSONB (nullable, stores example response structure)
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- UNIQUE constraint on `(rpc_endpoint_url, method_name)`
- Index on `(rpc_endpoint_url, last_checked_at DESC)`

**Note**: The schema uses the RPC endpoint URL directly rather than a separate `rpc_endpoints` table, as no such table was found during reconnaissance.

### Service
**File**: `backend/src/services/rpcCapabilityDiscovery.service.ts`

Methods:
- `discoverCapabilities(endpointUrl: string): Promise<MethodCapability[]>` — Probes a set of known RPC methods, records support status
- `getCapabilities(endpointUrl: string): Promise<MethodCapability[]>` — Returns all capabilities for an endpoint
- `refreshCapabilities(endpointUrl: string): Promise<void>` — Re-probes and updates existing records

**Known methods to probe**: `eth_blockNumber`, `eth_getBalance`, `eth_call`, `eth_sendRawTransaction`, `eth_getTransactionReceipt`, `net_version`, `web3_clientVersion`, etc.

**Job**: `backend/src/jobs/rpcCapabilityRefresh.job.ts` — BullMQ queue for periodic refresh (every 6 hours)

### API Routes
**File**: `backend/src/api/routes/rpcCapabilities.routes.ts`

- `GET /api/v1/admin/rpc-capabilities` — List all endpoint capabilities; admin only
- `GET /api/v1/admin/rpc-capabilities/:endpointUrl` — Get capabilities for one endpoint (URL-encoded); admin only
- `POST /api/v1/admin/rpc-capabilities/:endpointUrl/refresh` — Trigger re-discovery; admin only

Auth: `authMiddleware({ requiredScopes: ["admin:rpc"] })`

### UI
**File**: `frontend/src/pages/admin/RpcCapabilities.tsx`

- Table showing RPC endpoints with their supported/unsupported methods
- Columns: Endpoint URL, Method Name, Supported (badge), Last Checked
- Refresh button per endpoint
- Admin-only page

---

## Feature 2: Contract Address Allowlist Change Review (#1083)

### Data Model
**Migration**: `049_allowlist_change_requests.ts`

Table: `allowlist_change_requests`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `contract_address` TEXT NOT NULL
- `action` TEXT NOT NULL CHECK (action IN ('add', 'remove'))
- `reason` TEXT NOT NULL
- `requested_by` TEXT NOT NULL (actor ID)
- `status` TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
- `reviewed_by` TEXT (nullable)
- `review_comment` TEXT (nullable)
- `reviewed_at` TIMESTAMPTZ (nullable)
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- Index on `(status, created_at DESC)`

Table: `contract_allowlist`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `contract_address` TEXT NOT NULL UNIQUE
- `added_by` TEXT NOT NULL
- `added_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `is_active` BOOLEAN NOT NULL DEFAULT TRUE
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

### Service
**File**: `backend/src/services/allowlistChangeReview.service.ts`

Methods:
- `submitChangeRequest(params: { contractAddress, action, reason }, requestedBy: string)` — Creates a pending request; validates Ethereum address format
- `reviewRequest(id: string, decision: 'approved' | 'rejected', reviewedBy: string, comment?: string)` — Enforces four-eyes: `reviewedBy !== requested_by`
- `applyApprovedChange(id: string, appliedBy: string)` — Adds/removes from allowlist in a transaction; updates request status to 'applied'
- `getCurrentAllowlist()` — Returns all active entries
- `listChangeRequests(status?: string)` — Returns requests filtered by status

### API Routes
**File**: `backend/src/api/routes/allowlistChangeReview.routes.ts`

- `GET /api/v1/admin/allowlist` — Current allowlist; admin only
- `POST /api/v1/admin/allowlist/change-requests` — Submit request; admin only
- `GET /api/v1/admin/allowlist/change-requests` — List requests by status; admin only
- `POST /api/v1/admin/allowlist/change-requests/:id/review` — Approve or reject; admin only; enforces four-eyes
- `POST /api/v1/admin/allowlist/change-requests/:id/apply` — Apply approved change; admin only

Auth: `authMiddleware({ requiredScopes: ["admin:allowlist"] })`

### UI
**File**: `frontend/src/pages/admin/AllowlistManagement.tsx`

- Two tabs: "Current Allowlist" and "Change Requests"
- Current Allowlist tab: Table with contract address, added by, added at
- Change Requests tab: Table with request details, status badge, review controls (approve/reject buttons) for pending requests
- Show audit trail: requester, reviewer, review comment

---

## Feature 3: Token Decimal Change Detection (#1085)

### Data Model
**Migration**: `050_token_decimal_detection.ts`

Table: `token_decimal_snapshots`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `token_address` TEXT NOT NULL
- `decimals` INTEGER NOT NULL
- `snapshotted_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `chain_id` TEXT NOT NULL (e.g., '1' for Ethereum mainnet)
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- Index on `(token_address, snapshotted_at DESC)`

Table: `token_decimal_change_alerts`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `token_address` TEXT NOT NULL
- `previous_decimals` INTEGER NOT NULL
- `new_decimals` INTEGER NOT NULL
- `detected_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `alert_status` TEXT NOT NULL DEFAULT 'open' CHECK (alert_status IN ('open', 'acknowledged', 'resolved'))
- `acknowledged_by` TEXT (nullable)
- `resolved_at` TIMESTAMPTZ (nullable)
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- Index on `(alert_status, detected_at DESC)`

### Service
**File**: `backend/src/services/tokenDecimalDetection.service.ts`

Methods:
- `snapshotTokenDecimals(tokenAddresses: string[])` — Queries each token's current decimal value from the blockchain, stores snapshot, compares with previous snapshot, creates alert if changed
- `getActiveAlerts()` — Returns alerts with `alert_status = 'open'`
- `acknowledgeAlert(id: string, acknowledgedBy: string)` — Sets status to 'acknowledged'
- `resolveAlert(id: string, resolvedBy: string)` — Sets status to 'resolved', records `resolved_at`

**Job**: `backend/src/jobs/tokenDecimalSnapshot.job.ts` — BullMQ queue for periodic snapshot (every 12 hours)

### API Routes
**File**: `backend/src/api/routes/tokenDecimalAlerts.routes.ts`

- `GET /api/v1/admin/token-decimal-alerts` — List all alerts by status; admin only
- `POST /api/v1/admin/token-decimal-alerts/:id/acknowledge` — Acknowledge alert; admin only
- `POST /api/v1/admin/token-decimal-alerts/:id/resolve` — Resolve alert; admin only
- `GET /api/v1/admin/token-decimal-history/:tokenAddress` — Snapshot history; admin only

Auth: `authMiddleware({ requiredScopes: ["admin:monitoring"] })`

### UI
**File**: `frontend/src/pages/admin/TokenDecimalAlerts.tsx`

- Alert panel showing tokens with changed decimals
- Colour by severity: open (red), acknowledged (yellow), resolved (green)
- Show before/after decimal values
- Action buttons: Acknowledge, Resolve

---

## Feature 4: User-Scoped Export Quotas (#1055)

### Data Model
**Migration**: `051_export_quotas.ts`

Table: `export_quotas`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `user_id` TEXT NOT NULL (from `requested_by` in `export_history`)
- `quota_type` TEXT NOT NULL CHECK (quota_type IN ('daily', 'monthly'))
- `max_exports` INTEGER NOT NULL
- `period_start` DATE NOT NULL
- `current_count` INTEGER NOT NULL DEFAULT 0
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- UNIQUE constraint on `(user_id, quota_type, period_start)`
- Index on `(user_id, quota_type, period_start DESC)`

Table: `export_audit_log`
- `id` UUID PRIMARY KEY DEFAULT gen_random_uuid()
- `user_id` TEXT NOT NULL
- `export_type` TEXT NOT NULL (format, e.g., 'csv', 'json', 'pdf')
- `record_count` INTEGER NOT NULL
- `exported_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `quota_snapshot` JSONB NOT NULL (stores quota state at export time)
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- Index on `(user_id, exported_at DESC)`

### Service
**File**: `backend/src/services/exportQuota.service.ts`

Methods:
- `checkQuota(userId: string, quotaType: 'daily' | 'monthly'): Promise<{ allowed: boolean, remaining: number, resetsAt: Date }>` — Checks current quota without modifying
- `incrementExport(userId: string, exportType: string, recordCount: number)` — Atomic increment within transaction; throws `QuotaExceededException` if limit reached; logs to `export_audit_log`
- `resetExpiredQuotas()` — Resets `current_count` to 0 for periods that have rolled over; scheduled job
- `setUserQuota(userId: string, params: { quotaType, maxExports }, adminId: string)` — Admin override

**Job**: `backend/src/jobs/exportQuotaReset.job.ts` — BullMQ queue for daily reset check

### Integration
**Modified file**: `backend/src/services/export.service.ts`

In `requestExport` method, before creating the export record:
1. Call `exportQuotaService.checkQuota(userId, 'daily')`
2. If `!allowed`, throw error with HTTP 429 status
3. After export record is created, call `exportQuotaService.incrementExport(userId, payload.format, estimatedRecordCount)`

### API Routes
**File**: `backend/src/api/routes/exportQuota.routes.ts`

- `GET /api/v1/users/me/export-quota` — Current quota status for authenticated user
- `GET /api/v1/admin/export-quotas` — All user quotas; admin only
- `POST /api/v1/admin/export-quotas/:userId` — Set or update quota; admin only

Auth: User endpoint uses standard auth; admin endpoints use `authMiddleware({ requiredScopes: ["admin:quotas"] })`

**Modified file**: `backend/src/api/routes/exports.ts`

In POST `/` handler, wrap with quota check, return 429 with `Retry-After` header on quota exceeded.

### UI
**File**: `frontend/src/pages/ExportScheduler.tsx` (existing page, add quota indicator)

- Show quota status: "Exports remaining today: X / Y" with reset time
- Disable export button when quota exceeded

**File**: `frontend/src/pages/admin/ExportQuotas.tsx`

- Table listing all user quotas
- Columns: User ID, Quota Type, Max Exports, Current Count, Period Start
- Action: Adjust quota (inline edit or modal)

---

## Test Strategy

### Backend Tests
**Files**:
- `backend/tests/services/rpcCapabilityDiscovery.service.test.ts`
- `backend/tests/services/allowlistChangeReview.service.test.ts`
- `backend/tests/services/tokenDecimalDetection.service.test.ts`
- `backend/tests/services/exportQuota.service.test.ts`
- `backend/tests/api/rpcCapabilities.routes.test.ts`
- `backend/tests/api/allowlistChangeReview.routes.test.ts`
- `backend/tests/api/tokenDecimalAlerts.routes.test.ts`
- `backend/tests/api/exportQuota.routes.test.ts`

**Coverage target**: ≥ 90% for all new services and routes

### Non-Vacuousness
- Test 6 (four-eyes): Remove the `reviewedBy !== requested_by` check, confirm test fails, restore
- Test 15 (quota exceeded): Remove the quota check in `export.service.ts`, confirm test fails, restore

### E2E Tests
**File**: `backend/tests/integration/multi-feature.test.ts`

- Full allowlist workflow: submit → approve → apply → verify allowlist updated
- Export quota: exhaust quota, verify 429, reset quota, verify export succeeds

---

## Migration Order
1. `048_rpc_method_capabilities.ts`
2. `049_allowlist_change_requests.ts`
3. `050_token_decimal_detection.ts`
4. `051_export_quotas.ts`

Each migration is independent and can be applied in any order without conflicts.

---

## Security Considerations

1. **Allowlist four-eyes**: The `reviewRequest` method enforces `reviewedBy !== requested_by` to prevent self-approval
2. **Export quota atomic increment**: Uses Knex transaction to prevent race conditions
3. **Admin-only routes**: All new routes use `authMiddleware` with appropriate scopes
4. **Input validation**: Contract addresses validated with Ethereum address regex; token addresses validated before querying blockchain

---

## CI Requirements

All checks must pass:
- Migrations apply and rollback cleanly: `npm run migrate && npm run migrate:rollback`
- TypeScript compiles: `npx tsc --noEmit`
- Lint: `npm run lint`
- Tests: 22 tests pass, zero regressions
- Frontend build: `cd frontend && npm run build`
- E2E tests: `npm run test:integration`

---

## Conclusion

This approach implements all four features with:
- Independent database migrations that do not conflict
- Service layer with clear separation of concerns
- Admin-only API routes with proper authentication
- UI components following existing patterns
- Comprehensive test coverage with non-vacuous validation
- Atomic operations where required (four-eyes, quota increment)
- Scheduled jobs for periodic tasks (RPC refresh, decimal snapshots, quota reset)

All implementation decisions are derived from the actual codebase patterns discovered during reconnaissance.
