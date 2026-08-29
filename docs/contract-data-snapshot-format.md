# Contract Data Snapshot Format

Bridge Watch exposes a compact, read-only snapshot of current on-chain contract state for off-chain synchronization, backups, and auditing.

## Entrypoints

| Method | Auth | Returns |
|--------|------|---------|
| `export_contract_data_snapshot()` | None (read-only) | `StateExport` |
| `list_asset_state_snapshots()` | None (read-only) | `Vec<AssetStateSnapshot>` |

Implementation: `contracts/soroban/src/state_export.rs` and public wrappers in `contracts/soroban/src/lib.rs`.

## Difference from Checkpoints

| Feature | Contract data snapshot | Checkpoint |
|---------|------------------------|------------|
| Purpose | Current state export | Bounded historical snapshots + restore |
| Persistence | Not stored on-chain | Stored with retention/pruning |
| Payload | Compact per-asset summary | Full asset health, prices, health results |
| Auth | Read-only | Manual/restore requires admin |

See [checkpoint-format.md](./checkpoint-format.md) for checkpoint semantics.

## Top-Level Envelope (`StateExport`)

| Field | Type | Description |
|-------|------|-------------|
| `version` | `u32` | Schema version (`STATE_EXPORT_VERSION`, currently `1`) |
| `exported_at` | `u64` | Ledger timestamp when the export was generated |
| `contract_address` | `Address` | Contract that produced the export |
| `state_hash` | `String` | SHA-256 hex digest of the serialized snapshot list |
| `metadata` | `ExportMetadata` | Summary counts and notes |

### `ExportMetadata`

| Field | Type | Description |
|-------|------|-------------|
| `item_count` | `u32` | Number of asset snapshots included |
| `size_estimate_bytes` | `u32` | Rough payload size estimate (`item_count * 256`) |
| `compression_level` | `u32` | `0` = none |
| `notes` | `String` | Export label (`contract-data-snapshot`) |

## Per-Asset Payload (`AssetStateSnapshot`)

| Field | Type | Description |
|-------|------|-------------|
| `asset_code` | `String` | Monitored asset identifier |
| `status` | `String` | `Active`, `Paused`, `Inactive`, or `Unknown` |
| `compliance` | `String` | Compliance label (`Unknown` until registry integration) |
| `risk_rating` | `String` | `Low`, `Medium`, `High`, `Critical`, or `Unknown` |
| `risk_score_bps` | `u32` | Health score mapped to basis points (`health_score * 100`) |
| `chain_count` | `u32` | Reserved for registry chain links (`0` today) |
| `oracle_feed_count` | `u32` | Reserved for registry oracle feeds (`0` today) |
| `bridge_count` | `u32` | Reserved for registry bridge links (`0` today) |
| `pool_count` | `u32` | Reserved for registry pool links (`0` today) |
| `is_frozen` | `bool` | Mirrors asset pause state |
| `updated_at` | `u64` | Last health record timestamp |

## Stable Ordering

1. Asset codes are read from contract `monitored_assets` storage.
2. Snapshots are sorted lexicographically by `asset_code` before hashing and export.
3. Integrators should treat ordering as part of the contract — do not re-sort before verifying `state_hash`.

## Hash Algorithm

The `state_hash` is the lowercase hex encoding of SHA-256 over:

1. `STATE_EXPORT_VERSION` (`u32`, big-endian)
2. Snapshot count (`u32`, big-endian)
3. For each snapshot in sorted order:
   - Length-prefixed UTF-8 strings: `asset_code`, `status`, `compliance`, `risk_rating`
   - `risk_score_bps`, `chain_count`, `oracle_feed_count`, `bridge_count`, `pool_count` (`u32`, big-endian)
   - `is_frozen` (`u8`: `0` or `1`)
   - `updated_at` (`u64`, big-endian)

String fields are serialized as `u32` length followed by raw bytes (max 256 bytes per field in the hasher).

## Versioning

When fields change, increment `STATE_EXPORT_VERSION` and document the migration in this file and `docs/API_CHANGELOG.md` if an HTTP mirror is added later.
