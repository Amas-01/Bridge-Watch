# Asset Locking Feature

## Overview

The asset locking feature allows administrators to temporarily lock assets to prevent operational changes during maintenance windows or review processes. When an asset is locked, all mutating operations are blocked until the asset is explicitly unlocked.

## Functionality

### Lock Operations

- **Lock Asset**: Prevents all operational changes to an asset
- **Unlock Asset**: Resumes normal operations for a previously locked asset
- **Query Lock State**: Check if an asset is currently locked
- **Lock History**: View complete audit trail of lock/unlock operations

### Protected Operations

When an asset is locked, the following operations are blocked:

- Health score submissions (`submit_health`, `submit_health_batch`)
- Price updates (`submit_price`)
- Asset pause/unpause operations

### Authorization

Lock and unlock operations require one of the following roles:

- Contract Admin
- Super Admin
- Asset Manager

## API Functions

### `lock_asset(env, caller, asset_code, reason)`

Locks an asset to prevent operational changes.

**Parameters:**

- `env`: Environment
- `caller`: Address performing the lock
- `asset_code`: Asset identifier
- `reason`: Human-readable reason for locking

**Events Emitted:**

- `asset_lck`: Basic lock event
- `lock_set`: Structured event with caller, reason, and timestamp

**Panics:**

- Asset is already locked
- Asset is deregistered
- Caller lacks required permissions
- Contract is globally paused

### `unlock_asset(env, caller, asset_code)`

Unlocks an asset to resume operational changes.

**Parameters:**

- `env`: Environment
- `caller`: Address performing the unlock
- `asset_code`: Asset identifier

**Events Emitted:**

- `asset_ulk`: Basic unlock event
- `lock_clr`: Structured event with caller and timestamp

**Panics:**

- Asset is not locked
- Asset is deregistered
- Caller lacks required permissions
- Contract is globally paused

### `get_asset_lock_state(env, asset_code) -> Option<AssetLockState>`

Returns the current lock state for an asset.

**Returns:**

- `Some(AssetLockState)` if asset has been locked
- `None` if asset has never been locked

### `is_asset_locked(env, asset_code) -> bool`

Simple check if an asset is currently locked.

**Returns:**

- `true` if asset is locked
- `false` otherwise

### `get_asset_lock_history(env, asset_code) -> Vec<AssetLockRecord>`

Returns the complete lock/unlock history for an asset in chronological order.

## Data Structures

### AssetLockState

```rust
pub struct AssetLockState {
    pub asset_code: String,
    pub is_locked: bool,
    pub reason: String,
    pub locked_by: Address,
    pub locked_at: u64,
    pub unlocked_by: Option<Address>,
    pub unlocked_at: Option<u64>,
}
```

### AssetLockRecord

```rust
pub struct AssetLockRecord {
    pub locked: bool,       // true for lock, false for unlock
    pub reason: String,
    pub caller: Address,
    pub timestamp: u64,
}
```

## Usage Examples

### Locking an Asset

```rust
// Lock USDC for maintenance
client.lock_asset(
    &admin,
    &String::from_str(&env, "USDC"),
    &String::from_str(&env, "Emergency security patch")
);
```

### Checking Lock Status

```rust
// Check if asset is locked
let is_locked = client.is_asset_locked(&String::from_str(&env, "USDC"));

// Get detailed lock state
let lock_state = client.get_asset_lock_state(&String::from_str(&env, "USDC"));
if let Some(state) = lock_state {
    if state.is_locked {
        println!("Locked by: {:?}", state.locked_by);
        println!("Reason: {}", state.reason);
    }
}
```

### Unlocking an Asset

```rust
// Unlock after maintenance is complete
client.unlock_asset(
    &admin,
    &String::from_str(&env, "USDC")
);
```

### Viewing Lock History

```rust
// Get full audit trail
let history = client.get_asset_lock_history(&String::from_str(&env, "USDC"));
for record in history.iter() {
    if record.locked {
        println!("Locked at {} by {:?}: {}", record.timestamp, record.caller, record.reason);
    } else {
        println!("Unlocked at {} by {:?}", record.timestamp, record.caller);
    }
}
```

## Design Considerations

### Why Asset Locking?

Asset locking provides a critical safety mechanism for:

1. **Maintenance Windows**: Prevent data changes during system upgrades or maintenance
2. **Security Reviews**: Freeze asset state during security audits
3. **Incident Response**: Quickly halt operations on compromised assets
4. **Compliance**: Support regulatory requirements for change freezes

### Lock vs Pause

- **Pause**: User-facing feature to temporarily suspend monitoring
- **Lock**: Administrative feature to prevent all configuration changes

Locks provide stronger guarantees and are intended for administrative use only.

### Audit Trail

Every lock and unlock operation is recorded in the asset's history, providing complete audit transparency for compliance and incident investigation.

## Storage

### Keys Used

- `AssetDataKey::Lock(asset_code)`: Current lock state
- `AssetDataKey::LockHist(asset_code)`: Historical lock/unlock records

### Storage Type

- Persistent storage for both lock state and history
- History appends only, never truncated

## Testing

Comprehensive tests are located in `tests/asset_locking.test.rs` covering:

- Lock/unlock operations
- Authorization checks
- Guard enforcement on mutating operations
- History tracking
- Edge cases and error conditions
- Multiple lock/unlock cycles

## Integration

The asset locking feature integrates seamlessly with existing contract functionality:

- Guards are added to `submit_health`, `submit_price`, `pause_asset`, and `unpause_asset`
- Lock checks occur before other validation
- Respects existing permission system
- Works with global pause functionality

## Future Enhancements

Potential future improvements:

- Scheduled automatic locks/unlocks
- Lock expiration timestamps
- Bulk lock operations
- Lock notifications
- Integration with external monitoring systems
