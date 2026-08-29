# Approach Statement — Issue #524: Add Asset Restore Function

## Reconnaissance Summary

### Asset Status and Lifecycle
- **Current `AssetStatus` enum** (asset_registry.rs, line ~95):
  - `Active` — asset is active and operational
  - `Paused` — monitoring paused but recoverable  
  - `Deprecated` — read-only, not restorable
  - `PendingReview` — awaiting activation
  - **Missing**: `Deactivated` status variant needed for restore functionality

- **Lifecycle transition rules** (asset_registry.rs, lines ~623–631):
  - Valid transitions: `PendingReview → Active`, `Active ↔ Paused`, `Active|Paused → Deprecated`
  - **Invalid**: Deprecated → any other state (permanent)
  - **To be added**: `Active → Deactivated` and `Deactivated → Active` transitions

### Asset Metadata Structure
- **AssetMetadata struct** (asset_registry.rs, lines ~136–160):
  - Fields to preserve during deactivation/restoration:
    - `asset_code`, `name`, `symbol`, `issuer`, `decimals`: immutable identifiers (preserved)
    - `category`, `description`, `url`, `registered_at`, `registered_by`: historical (preserved)
    - `compliance`, `risk_rating`, `risk_score_bps`: asset properties (preserved)
    - `version`, `updated_at`: versioned on update (modify on each operation)
    - **No explicit `deactivated_at` field exists** — will use `updated_at` for timestamp tracking
    - Status field: `status` — transitions between `Active ↔ Deactivated`

- **Metadata versioning** (MetadataVersion struct, lines ~266–274):
  - Every state change is tracked: `version` increments, `changed_by` recorded, `change_reason` stored, `timestamp` recorded
  - Restoration will append a new version entry with reason "Asset restored"

### Storage Pattern
- **DataKey enum** (asset_registry.rs, lines ~300–321):
  - Asset core data: `DataKey::AssetMeta(String)`
  - Associated lists: `DataKey::Versions(String)`, `DataKey::StatusIndex(AssetStatus)`, etc.
  - Storage tier: `env.storage().persistent()` for all asset data
  - **No explicit TTL management** observed in asset registry (distinct from relay contract which bumps TTL)
  - Access pattern: `env.storage().persistent().set/get/has(&key)`

### Permission Model
- **Admin check helper** (asset_registry.rs, lines ~1202–1215):
  - `require_admin(&env, &caller) → Result<(), RegistryError>`
  - Caller must be the stored admin (pattern: `caller.require_auth()`)
  - Used by: all write operations (register_asset, update_status, freeze_asset, etc.)
  - **Deactivation and restoration**: will require admin permission, consistent with other lifecycle operations

### Error Handling
- **RegistryError enum** (asset_registry.rs, lines ~49–69):
  - Current codes: 1–20, sequential without gaps
  - Pattern: `#[contracterror] #[derive(...)] #[repr(u32)] pub enum RegistryError { Variant = code, }`
  - Variant 20 = `AssetFrozen`, so next available codes: **21, 22, 23, ...**
  - **New errors needed**:
    - `AssetAlreadyActive = 21` — attempted to deactivate an already-active asset (redundant case)
    - `AssetNotDeactivated = 22` — attempting to restore an asset that is not in Deactivated status
    - Note: `AssetNotFound` already exists (code 4) and will be reused

### Event Emission Pattern
- **Event publishing** (asset_registry.rs, examples at lines ~659, ~727, etc.):
  - Pattern: `env.events().publish((symbol_short!("topic"), asset_code), data)`
  - Topic is a tuple: `(Symbol, String)` where Symbol is short identifier
  - Event topics in use: `ar_stat` (status), `ar_cat` (category), `ar_risk` (risk), etc.
  - Data payload: varies (u32, 1u32, etc.)
  - **New events needed**:
    - `("asset_deactivated", asset_code)` with data: admin address (for audit trail)
    - `("asset_restored", asset_code)` with data: admin address (for audit trail)

### Existing Tests
- **Test framework**: Soroban #[test] with testutils (soroban_sdk::testutils)
- **Test pattern** (asset_registry.rs, lines ~1318+):
  - Setup helper: `fn setup() → (Env, AssetRegistryContractClient, Address)`
  - Register helper: `fn register_usdc(...) → String`
  - Assertions: `assert_eq!`, `assert!`, `.unwrap()`, `.is_err()`
  - Mock auth: `env.mock_all_auths()`
  - Tests are marked `#[cfg(test)]` and grouped by feature area

## Implementation Plan

### 1. Add Deactivated Status
- **File**: `contracts/soroban/src/asset_registry.rs`, AssetStatus enum
- **Change**: Add variant `Deactivated,` with doc comment "Asset is deactivated; awaiting restoration"

### 2. Add Error Variants
- **File**: `contracts/soroban/src/asset_registry.rs`, RegistryError enum  
- Add:
  - `AssetAlreadyActive = 21` — attempted to deactivate an asset that is already active (defensive)
  - `AssetNotDeactivated = 22` — attempted to restore an asset that is not in deactivated state

### 3. Implement deactivate_asset Function
- **File**: `contracts/soroban/src/asset_registry.rs`, AssetRegistryContract impl
- **Function signature**:
  ```rust
  pub fn deactivate_asset(
      env: Env,
      admin: Address,
      asset_code: String,
      reason: String,
  ) -> Result<(), RegistryError>
  ```
- **Logic**:
  - Step 1: `Self::require_admin(&env, &admin)?` — auth check
  - Step 2: Load metadata, fail if not found (`AssetNotFound`)
  - Step 3: Verify asset is currently `Active` (not already deactivated/deprecated), else `AssetAlreadyActive`
  - Step 4: Update status to `Deactivated`, increment version, update timestamp
  - Step 5: Remove from `StatusIndex(Active)`, add to `StatusIndex(Deactivated)`
  - Step 6: Call `save_with_version` to record version entry
  - Step 7: Emit event: `publish((symbol_short!("asset_deact"), asset_code), admin)`
  - Step 8: Return `Ok(())`

### 4. Implement restore_asset Function
- **File**: `contracts/soroban/src/asset_registry.rs`, AssetRegistryContract impl
- **Function signature**:
  ```rust
  pub fn restore_asset(
      env: Env,
      admin: Address,
      asset_code: String,
  ) -> Result<(), RegistryError>
  ```
- **Logic**:
  - Step 1: `Self::require_admin(&env, &admin)?` — auth check
  - Step 2: Load metadata, fail if not found (`AssetNotFound`)
  - Step 3: Verify asset is in `Deactivated` status, else `AssetNotDeactivated`
  - Step 4: Restore status to `Active`, increment version, update timestamp
  - Step 5: Remove from `StatusIndex(Deactivated)`, add to `StatusIndex(Active)`
  - Step 6: Call `save_with_version` to record version entry with reason "Asset restored"
  - Step 7: Emit event: `publish((symbol_short!("asset_rest"), asset_code), admin)`
  - Step 8: Return `Ok(())`

### 5. Update Lifecycle Transition Rules
- **File**: `asset_registry.rs`, update_status function validation logic
- **Current rule** (lines ~623–631): transitions validated in matches! macro
- **Addition**: Add rules:
  - `(Active, Deactivated)` — allowed (via dedicated deactivate_asset function, but allow in update_status too for consistency)
  - `(Deactivated, Active)` — **NOT** allowed here (only via dedicated restore_asset function to ensure proper version tracking)
- **Rationale**: deactivate/restore are intentional operations with dedicated functions; update_status remains for standard lifecycle

### 6. Tests to Implement
- **Happy path**: Deactivate active asset → verify status = Deactivated, version incremented, event emitted
- **State continuity**: Before deactivation, record all fields; after restoration, verify all non-status fields unchanged
- **Error: restore non-deactivated**: Try to restore an Active asset → AssetNotDeactivated
- **Error: deactivate non-active**: Try to deactivate a Paused or Deprecated asset → AssetAlreadyActive
- **Error: unknown asset**: Deactivate/restore non-existent asset code → AssetNotFound
- **Error: unauthorized**: Deactivate/restore from non-admin address → auth error, no state change
- **Idempotency**: Deactivate→restore→deactivate→restore yields same consistent state each time
- **Version history**: 3 version entries: registration, deactivation, restoration

### 7. Documentation Updates
- **File**: `docs/asset-lifecycle.md` (if exists, or to be created)
  - Document `Deactivated` status and when it's used
  - Document `deactivate_asset` and `restore_asset` functions
  - Add permission requirements (admin only)
  - Confirm state continuity guarantee
- **Inline doc comments**: Full /// doc comments on new functions and error variants

## Files to Modify
1. `contracts/soroban/src/asset_registry.rs` — main implementation (enum, functions, errors, tests)
2. `docs/asset-lifecycle.md` (or create) — lifecycle documentation

## Files to Create
- None (all changes in existing asset_registry.rs)

## Unresolved Questions
- None — specification is clear from codebase patterns

## CI Requirements (from .github/workflows/ci.yml)
- `cargo fmt --all -- --check` — formatting
- `cargo clippy -- -D warnings` — linting
- `cargo build --verbose` — compilation
- `cargo test --verbose` — all tests including new restoration tests

## Confidence Level
**High** — all patterns from existing code are well-established and the implementation closely mirrors freeze_asset/unfreeze_asset and update_status patterns.
