# Circuit Health API

## Overview

The Circuit Health API provides comprehensive health information for alerting and protection circuits used by the Bridge-Watch platform. This API enables real-time monitoring of circuit breaker states, recent transitions, manual overrides, and cache performance.

## Features

- **Complete Circuit State Visibility**: Get health status for global, bridge-level, and asset-level circuits
- **Transition Tracking**: Monitor recent circuit state changes with timestamps and reasons
- **Manual Overrides**: Query whitelisted addresses, assets, and bridges that bypass circuit protections
- **Efficient Caching**: Built-in Redis caching with 60-second TTL for optimal performance
- **Query Support**: Filter by scope, identifier, and time ranges
- **Cache Statistics**: Monitor cache performance for optimization

## Architecture

### Service: CircuitHealthService

Located at: `backend/src/services/circuitHealth.service.ts`

The `CircuitHealthService` provides:
- Retrieval of circuit health information across all scopes
- Redis-based caching with automatic invalidation
- Query filtering and aggregation
- Error handling and graceful degradation

### API Routes

Located at: `backend/src/api/routes/circuitHealth.ts`

Registered at: `/api/v1/circuit-health/`

## Endpoints

### 1. GET /health
Get comprehensive circuit health information for all scopes.

**Query Parameters:**
- `includeHistory` (boolean, optional) - Include full transition history (bypasses cache)
- `historyLimit` (integer, optional) - Maximum transitions to return (default: 100, max: 1000)

**Response:**
```json
{
  "timestamp": 1719921234,
  "global": {
    "scope": "global",
    "identifier": null,
    "level": "none",
    "isPaused": false,
    "triggeredBy": null,
    "triggerReason": null,
    "timestamp": null,
    "recoveryDeadline": null,
    "guardianApprovals": null,
    "guardianThreshold": null,
    "status": null
  },
  "bridges": {
    "stellar-usdc": {
      "scope": "bridge",
      "identifier": "stellar-usdc",
      "level": "partial",
      "isPaused": true,
      "triggeredBy": "GBXYZ...",
      "triggerReason": "Reserve ratio breach: 95% (threshold: 90%)",
      "timestamp": 1719920000,
      "recoveryDeadline": 1719923600,
      "guardianApprovals": 2,
      "guardianThreshold": 3,
      "status": "active"
    }
  },
  "assets": {
    "USDC": {
      "scope": "asset",
      "identifier": "USDC",
      "level": "warning",
      "isPaused": true,
      "triggeredBy": "GABC...",
      "triggerReason": "Price deviation: 5.2% (threshold: 5%)",
      "timestamp": 1719919000,
      "recoveryDeadline": 1719922600,
      "guardianApprovals": 1,
      "guardianThreshold": 3,
      "status": "active"
    }
  },
  "recentTransitions": [
    {
      "id": "pause-1",
      "pauseId": 1,
      "scope": "asset",
      "identifier": "USDC",
      "level": "warning",
      "triggeredBy": "GABC...",
      "reason": "Price deviation: 5.2% (threshold: 5%)",
      "timestamp": 1719919000,
      "recoveryDeadline": 1719922600,
      "status": "active"
    }
  ],
  "manualOverrides": [
    {
      "id": 1,
      "type": "address",
      "value": "G123ABC...",
      "addedBy": "admin_key",
      "addedAt": "2024-07-02T10:30:00Z"
    }
  ],
  "cacheExpiresAt": 1719921294
}
```

**Response Status Codes:**
- `200 OK` - Success
- `500 Internal Server Error` - Server error

### 2. GET /health/state
Get the circuit state for a specific scope.

**Query Parameters:**
- `scope` (string, required) - One of: `global`, `bridge`, `asset`
- `identifier` (string, required for bridge/asset) - Bridge ID or asset code

**Response:**
```json
{
  "scope": "bridge",
  "identifier": "stellar-usdc",
  "level": "partial",
  "isPaused": true,
  "triggeredBy": "GBXYZ...",
  "triggerReason": "Reserve ratio breach: 95% (threshold: 90%)",
  "timestamp": 1719920000,
  "recoveryDeadline": 1719923600,
  "guardianApprovals": 2,
  "guardianThreshold": 3,
  "status": "active"
}
```

**Response Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Invalid scope or missing identifier
- `500 Internal Server Error` - Server error

**Examples:**
```bash
# Get global circuit state
curl "http://localhost:3000/api/v1/circuit-health/health/state?scope=global"

# Get bridge circuit state
curl "http://localhost:3000/api/v1/circuit-health/health/state?scope=bridge&identifier=stellar-usdc"

# Get asset circuit state
curl "http://localhost:3000/api/v1/circuit-health/health/state?scope=asset&identifier=USDC"
```

### 3. GET /health/transitions
Get recent circuit transitions with optional filtering.

**Query Parameters:**
- `limit` (integer, optional) - Number of transitions (default: 50, max: 500)
- `scope` (string, optional) - Filter by scope: `global`, `bridge`, `asset`
- `identifier` (string, optional) - Filter by identifier (requires scope)

**Response:**
```json
[
  {
    "id": "pause-1",
    "pauseId": 1,
    "scope": "asset",
    "identifier": "USDC",
    "level": "warning",
    "triggeredBy": "GABC...",
    "reason": "Price deviation: 5.2% (threshold: 5%)",
    "timestamp": 1719919000,
    "recoveryDeadline": 1719922600,
    "status": "active"
  },
  {
    "id": "pause-2",
    "pauseId": 2,
    "scope": "bridge",
    "identifier": "stellar-usdc",
    "level": "partial",
    "triggeredBy": "GBXYZ...",
    "reason": "Reserve ratio breach: 95% (threshold: 90%)",
    "timestamp": 1719920000,
    "recoveryDeadline": 1719923600,
    "status": "active"
  }
]
```

**Response Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Invalid parameters
- `500 Internal Server Error` - Server error

**Examples:**
```bash
# Get 50 recent transitions
curl "http://localhost:3000/api/v1/circuit-health/health/transitions?limit=50"

# Get transitions for a specific bridge
curl "http://localhost:3000/api/v1/circuit-health/health/transitions?scope=bridge&identifier=stellar-usdc&limit=20"

# Get last 100 transitions
curl "http://localhost:3000/api/v1/circuit-health/health/transitions?limit=100"
```

### 4. GET /health/overrides
Get manual overrides (whitelisted items) that bypass circuit protections.

**Query Parameters:**
- `type` (string, optional) - Filter by type: `address`, `asset`, `bridge` (default: `address`)

**Response:**
```json
[
  {
    "id": 1,
    "type": "address",
    "value": "G123ABC...",
    "addedBy": "admin_key",
    "addedAt": "2024-07-02T10:30:00Z"
  },
  {
    "id": 2,
    "type": "address",
    "value": "G456DEF...",
    "addedBy": "guardian_key",
    "addedAt": "2024-07-01T15:45:00Z"
  }
]
```

**Response Status Codes:**
- `200 OK` - Success
- `400 Bad Request` - Invalid type
- `500 Internal Server Error` - Server error

**Examples:**
```bash
# Get all whitelisted addresses
curl "http://localhost:3000/api/v1/circuit-health/health/overrides?type=address"

# Get all whitelisted assets
curl "http://localhost:3000/api/v1/circuit-health/health/overrides?type=asset"

# Get all whitelisted bridges
curl "http://localhost:3000/api/v1/circuit-health/health/overrides?type=bridge"
```

### 5. GET /health/cache/stats
Get cache performance statistics for monitoring.

**Response:**
```json
{
  "hitRate": 0.87,
  "missCount": 0,
  "size": 45,
  "ttl": 60
}
```

**Response Fields:**
- `hitRate` (number) - Cache hit rate (0-1)
- `missCount` (integer) - Number of cache misses
- `size` (integer) - Number of cached items
- `ttl` (integer) - Cache time-to-live in seconds

**Response Status Codes:**
- `200 OK` - Success
- `500 Internal Server Error` - Server error

**Examples:**
```bash
curl "http://localhost:3000/api/v1/circuit-health/health/cache/stats"
```

## Data Models

### CircuitState

Represents the current state of a circuit.

```typescript
interface CircuitState {
  scope: "global" | "bridge" | "asset";
  identifier: string | null;  // null for global, bridge ID or asset code otherwise
  level: "none" | "warning" | "partial" | "full";
  isPaused: boolean;
  triggeredBy: string | null;  // Address of guardian who triggered
  triggerReason: string | null;  // Reason for the pause
  timestamp: number | null;  // Unix timestamp when paused
  recoveryDeadline: number | null;  // Unix timestamp for recovery deadline
  guardianApprovals: number | null;  // Number of guardian approvals
  guardianThreshold: number | null;  // Required threshold for recovery
  status: "active" | "recovering" | "resolved" | null;
}
```

### CircuitTransition

Represents a state change of a circuit.

```typescript
interface CircuitTransition {
  id: string;  // Unique identifier
  pauseId: number;  // Reference to pause event
  scope: "global" | "bridge" | "asset";
  identifier: string | null;
  level: "none" | "warning" | "partial" | "full";
  triggeredBy: string;  // Address that triggered the change
  reason: string;  // Reason for the transition
  timestamp: number;  // When the transition occurred
  recoveryDeadline: number;  // Recovery deadline
  status: "active" | "recovering" | "resolved";
}
```

### ManualOverride

Represents a whitelisted item that bypasses circuit protections.

```typescript
interface ManualOverride {
  id: number;
  type: "address" | "asset" | "bridge";
  value: string;  // Address, asset code, or bridge ID
  addedBy: string;  // Address that added the override
  addedAt: Date;  // When the override was added
}
```

## Caching Strategy

The Circuit Health API uses Redis for efficient caching:

- **TTL**: 60 seconds
- **Full health cache**: Cached when no `includeHistory` parameter is provided
- **State cache**: Individual circuit states are cached per scope/identifier
- **Whitelist cache**: Cached by type (address, asset, bridge)
- **Invalidation**: Automatic on TTL expiration, or manual via service methods

## Error Handling

All endpoints follow standard HTTP status codes:

- `200 OK` - Successful request
- `400 Bad Request` - Invalid parameters or missing required fields
- `500 Internal Server Error` - Server-side error

Error responses include a message field:
```json
{
  "error": "Invalid or missing scope"
}
```

## Rate Limiting

The Circuit Health API is not subject to API key rate limiting but follows the platform's general rate limits.

## Integration Examples

### Monitor Global Circuit Health
```bash
curl -s "http://localhost:3000/api/v1/circuit-health/health" | jq '.global'
```

### Check if Bridge is Paused
```bash
curl -s "http://localhost:3000/api/v1/circuit-health/health/state?scope=bridge&identifier=stellar-usdc" \
  | jq '.isPaused'
```

### Get Recent Pausees and their Reasons
```bash
curl -s "http://localhost:3000/api/v1/circuit-health/health/transitions?limit=10" \
  | jq '.[] | select(.status == "active") | {identifier: .identifier, reason: .reason}'
```

### Monitor Cache Performance
```bash
curl -s "http://localhost:3000/api/v1/circuit-health/health/cache/stats" | jq '.'
```

### Check Emergency Overrides
```bash
curl -s "http://localhost:3000/api/v1/circuit-health/health/overrides?type=address" | jq '.[] | .value'
```

## Best Practices

1. **Use Specific Queries**: When possible, use the `/health/state` endpoint with specific scope and identifier to benefit from caching
2. **Monitor Cache Stats**: Regularly check `/health/cache/stats` to ensure cache is operating efficiently
3. **Handle Timestamps**: All timestamps are Unix epoch in seconds. Convert to ISO 8601 if needed
4. **Filter Transitions**: Use scope and identifier filters when querying transitions to reduce payload size
5. **Polling Strategy**: For monitoring, poll the specific state endpoint every 10-30 seconds rather than the full health endpoint

## Implementation Details

### Service: CircuitHealthService

```typescript
// Retrieve full circuit health
const health = await healthService.getCircuitHealth();

// Retrieve specific circuit state
const bridgeState = await healthService.getCircuitHealth({
  scope: 'bridge',
  identifier: 'stellar-usdc'
});

// Get recent transitions
const transitions = await healthService.getRecentTransitions(50, 'bridge', 'stellar-usdc');

// Check whitelist
const isWhitelisted = await healthService.isWhitelisted('address', '0xABC...');

// Invalidate cache
await healthService.invalidateCache('bridge', 'stellar-usdc');
```

## Database Schema

The Circuit Health API queries the following tables:

- `circuit_breaker_pauses` - Current and historical pause states
- `circuit_breaker_whitelist` - Manual overrides
- `circuit_breaker_triggers` - Alert triggers that caused pauses

## Performance Characteristics

- **Full health endpoint**: ~50-100ms (with cache) or ~200-400ms (without cache)
- **Specific state endpoint**: ~10-50ms (with cache)
- **Transitions endpoint**: ~50-150ms depending on filters
- **Cache hit rate**: Expected 70-90% with normal polling patterns

## Related Endpoints

- `/api/v1/circuit-breaker/status` - Check pause status (complementary endpoint)
- `/api/v1/circuit-breaker/whitelist` - Manage whitelists
- `/api/v1/alerts` - Alert information that may trigger circuits

## Version History

- v1.0 (2024-07): Initial release with comprehensive health information, caching, and query support
