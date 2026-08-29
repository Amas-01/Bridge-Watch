# Contract Architecture

Design and structure of the Stellar Bridge Watch smart contracts deployed on Soroban.

## Overview

Bridge Watch includes two Soroban smart contract packages:

| Contract | Crate | Purpose |
|----------|-------|---------|
| **Bridge Watch Core** | `contracts/soroban/` | Asset registry, health scoring, alerts, circuit breaker |
| **Transfer State Machine** | `contracts/transfer_state_machine/` | Bridge transfer lifecycle management |

Both contracts are written in **Rust** and target `wasm32-unknown-unknown` for deployment on Stellar's Soroban platform.

## Bridge Watch Core Contract

### Module Structure

```
contracts/soroban/src/
├── lib.rs                      # Contract entry point and module declarations
├── acl.rs                      # Access control lists and permissions
├── alert_system.rs             # On-chain deviation alerts
├── analytics_aggregator.rs     # Analytics computation
├── asset_registry.rs           # Asset registration and metadata
├── bridge_reserve_verifier.rs  # Reserve proof verification
├── circuit_breaker.rs          # Automatic pause/resume mechanism
├── escrow_contract.rs          # Escrow management
├── fee_distribution.rs         # Fee splitting and distribution
├── governance.rs               # Governance mechanisms
├── insurance_pool.rs           # Insurance fund management
├── liquidity_pool.rs           # Liquidity pool operations
├── multisig_treasury.rs        # Multi-signature treasury
├── rate_limiter.rs             # On-chain rate limiting
├── reputation_system.rs        # Bridge operator reputation tracking
├── state_export.rs             # Compact contract data snapshots (issue #453)
└── relay/                      # Relay contract directory
```

See [contract-data-snapshot-format.md](../contract-data-snapshot-format.md) for the export schema.

### Key Data Structures

#### Asset Health

```rust
pub struct AssetHealth {
    pub asset_code: String,
    pub health_score: u32,            // 0-100 composite score
    pub liquidity_score: u32,         // Liquidity depth score
    pub price_stability_score: u32,   // Price stability score
    pub bridge_uptime_score: u32,     // Bridge reliability score
    pub paused: bool,                 // Circuit breaker paused
    pub active: bool,                 // Asset actively monitored
    pub timestamp: u64,
    pub expires_at: u64,
}
```

#### Health Weights

```rust
pub struct HealthWeights {
    pub liquidity_weight: u32,        // default 30
    pub price_stability_weight: u32,  // default 40
    pub bridge_uptime_weight: u32,    // default 30
    pub version: u32,
}
```

#### Alert System

```rust
pub enum DeviationSeverity {
    Low,    // > 2% deviation
    Medium, // > 5% deviation
    High,   // > 10% deviation
}

pub struct DeviationAlert {
    pub asset_code: String,
    pub current_price: i128,
    pub average_price: i128,
    pub deviation_bps: i128,  // basis points
    pub severity: DeviationSeverity,
    pub timestamp: u64,
}
```

#### Liquidity Depth

```rust
pub struct LiquidityDepth {
    pub asset_pair: String,
    pub total_liquidity: i128,
    pub depth_0_1_pct: i128,   // liquidity at 0.1% price impact
    pub depth_0_5_pct: i128,   // liquidity at 0.5% price impact
    pub depth_1_pct: i128,     // liquidity at 1% price impact
    pub depth_5_pct: i128,     // liquidity at 5% price impact
    pub sources: Vec<String>,  // DEX sources
    pub timestamp: u64,
}
```

### Core Modules

**Asset Registry (`asset_registry.rs`)**
- Register and deregister monitored assets
- Store asset metadata (issuer, bridges, DEX pairs)
- Query asset status and configuration

**Circuit Breaker (`circuit_breaker.rs`)**
- Automatically pause asset monitoring when health score drops below threshold
- Manual pause/resume by authorized administrators
- Whitelist addresses exempt from circuit breaker restrictions
- Maintains pause history and trigger records

**Alert System (`alert_system.rs`)**
- On-chain price deviation detection
- Severity classification (Low/Medium/High based on deviation percentage)
- Alert event emission for off-chain consumption

**Bridge Reserve Verifier (`bridge_reserve_verifier.rs`)**
- Verify on-chain reserves against reported circulating supply
- Compare cross-chain data for reserve backing
- Emit verification results as contract events

**Fee Distribution (`fee_distribution.rs`)**
- Split fees between protocol, operators, and insurance pool
- Configurable fee percentages via governance

**Governance (`governance.rs`)**
- Proposal creation and voting
- Parameter update through governance process
- Time-locked execution of approved changes

**Configuration history**
- Every `set_config()` write appends an audit entry with the previous value, new value, version, timestamp, and author.
- The history is capped per key and exposed through `get_config_audit_log()`.
- See [contract-configuration-history.md](../contract-configuration-history.md) for the read/write flow and operational guidance.

## Transfer State Machine Contract

### State Diagram

```
                    ┌──────────┐
                    │ Initiated│
                    └────┬─────┘
                         │
                    ┌────▼──────────┐
                    │AwaitingSource │
                    └────┬──────────┘
                         │
                    ┌────▼──────────┐
                    │ EscrowPending │
                    └────┬──────────┘
                         │
                    ┌────▼──────────┐
                    │ EscrowLocked  │
                    └────┬──────────┘
                         │
              ┌──────────┼──────────┐
              │          │          │
    ┌─────────▼───┐ ┌────▼────────┐│
    │Verification ││OraclePending ││
    │Pending      ││              ││
    └─────────┬───┘ └────┬────────┘│
              │          │          │
              ▼          ▼          │
        ┌─────────────────────┐     │
        │  ReleasePending     │     │
        └─────────┬───────────┘     │
                  │                 │
      ┌───────────┼─────────┐      │
      │           │         │      │
┌─────▼───┐ ┌────▼────┐ ┌──▼──────▼──┐
│Completed│ │ Failed  │ │RollingBack │
│(terminal)│ │(terminal)│ └──────┬─────┘
└─────────┘ └─────────┘        │
                          ┌─────▼─────┐
                          │RolledBack │
                          │(terminal) │
                          └───────────┘
                          ┌───────────┐
                          │ TimedOut  │
                          │(terminal) │
                          └───────────┘
```

### Transfer States

```rust
pub enum TransferState {
    Initiated,           // Created, awaiting source acknowledgement
    AwaitingSource,      // Waiting for source chain finality/attestations
    EscrowPending,       // Awaiting escrow lock
    EscrowLocked,        // Escrow has locked the liquidity
    VerificationPending, // Running verification checks
    OraclePending,       // Awaiting oracle attestation
    ReleasePending,      // Final checks before completion
    Completed,           // Terminal: successful transfer
    Failed,              // Terminal: transfer failed
    RollingBack,         // In-progress rollback
    RolledBack,          // Terminal: successfully rolled back
    TimedOut,            // Terminal: deadline exceeded
}
```

### Transfer Data

```rust
pub struct BridgeTransfer {
    pub id: u64,
    pub initiator: Address,
    pub bridge_type: BridgeType,
    pub mode: TransferMode,
    pub asset: String,
    pub amount: i128,
    pub dest_hint: String,         // Destination address hint
    pub state: TransferState,
    pub state_deadline: u64,       // Timeout for current state
    pub verification_ok: bool,
    pub oracle_ok: bool,
}

pub enum BridgeType {
    LockMint,        // Lock on source, mint on destination
    BurnRelease,     // Burn on source, release on destination
    NativeWrapped,   // Wrap native asset for bridging
    Cctp,            // Circle CCTP protocol
    Custom,          // Custom bridge implementation
}

pub enum TransferMode {
    Standard,        // Normal processing speed
    FastTrack,       // Expedited (higher fee)
    Insured,         // Insurance pool backed
}
```

### Audit Trail

Each transfer maintains an on-chain audit log:
- **Maximum 48 entries** per transfer (gas-bounded)
- Events are emitted for each state transition

**Event Types:**

| Event | Description |
|-------|-------------|
| `tr_init` | Transfer initiated |
| `tr_adv` | State advanced |
| `tr_to` | Timed out |
| `tr_rb` | Rollback triggered |
| `tr_adm` | Admin action |
| `tr_vrf` | Verification result |
| `tr_orc` | Oracle attestation |
| `tr_aut` | Authorization check |

## Build and Test

```bash
# Build contracts
cd contracts && cargo build

# Run tests
cd contracts && cargo test

# Format code
cd contracts && cargo fmt --all

# Run clippy lints
cd contracts && cargo clippy -- -D warnings

# Build for deployment (WASM)
cd contracts && cargo build --target wasm32-unknown-unknown --release
```

## Design Principles

1. **Minimal contract size** — Avoid heavy dependencies to reduce deployment costs
2. **Gas efficiency** — Bounded loops and storage operations
3. **Separation of concerns** — Each module handles a single domain
4. **Upgradability** — State stored separately from logic for upgrade paths
5. **Trustless verification** — On-chain health data enables independent verification
6. **Audit trail** — All state changes are logged for transparency
