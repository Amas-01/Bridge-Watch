# Contract Configuration History

Bridge Watch stores an append-only audit log for contract configuration changes in the Soroban core contract.

## What is recorded

- Configuration writes performed through `set_config()`
- Threshold override updates recorded by the threshold override helpers
- Version number, previous value, new value, timestamp, and changing address

The history is capped to the most recent 50 entries per configuration key so the contract remains bounded.

## Read API

Use `get_config_audit_log(category, name)` to fetch the history for a specific configuration parameter.

```rust
let log = client.get_config_audit_log(&ConfigCategory::Timeouts, &String::from_str(&env, "pause_timelock_seconds"));
```

The returned entries are ordered from oldest to newest.

## Operational use

- Review the log before approving changes to sensitive parameters.
- Compare the previous and new values when investigating a config-related incident.
- Use the timestamp and author fields to reconstruct the change timeline without querying off-chain systems.

## Related contract behavior

- `set_config()` appends a history entry on every successful write.
- `get_all_configs()` returns the current values only; it does not include the audit trail.
- The same audit pattern is used for threshold overrides so operational changes remain traceable.

