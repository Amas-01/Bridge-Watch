# Issue #1015 — Versioned Chain Adapter & ABI Compatibility Registry

**Area:** Blockchain integration and contract upgrades

## Problem

ABIs, event layouts, proxy implementations and chain-specific semantics evolve.
A changed decoder can silently reinterpret historical logs or accept an
incompatible contract as the configured bridge.

## What was built

A signed, versioned chain-adapter registry. Each adapter **epoch** is an
immutable record of a contract's decoding contract at a point in its history:
contract identity, ABI hash, deployment block range, decimals, proxy
implementation history, event schemas and an optional migration handler.

| Piece | Path |
| --- | --- |
| Migration | [backend/src/database/migrations/20260829010000_versioned_chain_adapter_registry.ts](backend/src/database/migrations/20260829010000_versioned_chain_adapter_registry.ts) |
| Service | [backend/src/services/chainAdapterRegistry.service.ts](backend/src/services/chainAdapterRegistry.service.ts) |
| HTTP API | [backend/src/api/routes/chainAdapterRegistry.routes.ts](backend/src/api/routes/chainAdapterRegistry.routes.ts) → `/api/v1/chain-adapters` |
| Fixtures | [backend/src/services/chainAdapters/fixtures/](backend/src/services/chainAdapters/fixtures/) (`ethereum`, `polygon`, `base`) |
| Unit tests | [backend/tests/services/chainAdapterRegistry.service.test.ts](backend/tests/services/chainAdapterRegistry.service.test.ts) |
| Fixture CI tests | [backend/tests/services/chainAdapterRegistry.fixtures.test.ts](backend/tests/services/chainAdapterRegistry.fixtures.test.ts) |

### Tables

- `chain_adapter_signers` — trusted signer public keys (ed25519 / secp256k1 / p256).
- `chain_adapters` — one row per adapter epoch; unique `registry_version`
  (`chain:identity:epoch`), partial-unique index enforces **one active epoch**
  per `(chain_id, contract_identity)`.
- `chain_adapter_quarantine` — quarantined ingestion with the reason and the raw log.

## Acceptance criteria

| Criterion | How it is met |
| --- | --- |
| Unknown bytecode or ABI changes quarantine ingestion | `validateAndRouteIngestion()` compares the observed bytecode / ABI hash against the resolved epoch and writes a `chain_adapter_quarantine` row (reasons `unknown_bytecode`, `abi_change`, `no_active_adapter`, `out_of_range`, `decode_failure`) instead of decoding. Exposed at `POST /api/v1/chain-adapters/validate` (409 on quarantine). |
| Proxy upgrades create explicit adapter epochs | `recordProxyUpgrade()` always stages a **new** epoch starting at the upgrade block with the implementation appended to `proxy_history`; `POST /api/v1/chain-adapters/proxy-upgrades`. |
| Decoding is reproducible from registry version + raw log | `decodeHistoricalLog(registryVersion, rawLog)` loads the stored ABI for that exact epoch and decodes deterministically (bigints → strings, stable arg names). `POST /api/v1/chain-adapters/decode`. |
| Operators can stage and roll back an adapter without data loss | `stageAdapter()` (signature verified against a registered signer before the row is written) → `activateAdapter()` (closes the prior epoch's block range, marks it `superseded`) → `rollbackAdapter()` (marks the epoch `rolled_back`, re-opens the previous `superseded` epoch as `active`). Historical rows are never mutated — only the "current decoder" pointer moves. |
| CI verifies fixtures across every supported chain | `chainAdapterRegistry.fixtures.test.ts` iterates `SUPPORTED_CHAINS` and, for each, asserts the fixture exists, metadata is self-consistent, every sample log decodes to its expected event/args, and decoding is reproducible. Runs in the existing `Run backend tests` CI step. |

## Follow-ups (not in this change)

- Call `chainAdapterRegistryService.validateAndRouteIngestion()` from the EVM
  watchers (`wormholeWatcher.service.ts`, `bridgeMonitor.worker.ts`) so live
  ingestion is gated by the registry.
- Soroban adapters (schema-based, non-EVM decoding) — the registry schema
  already carries `event_schemas`; a Soroban decoder path can slot in alongside
  `decodeLogWithAbi`.
