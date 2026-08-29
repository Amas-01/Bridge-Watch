# API Authentication Guide

This guide explains how API authentication works in Bridge Watch, including API key methods, scope design, token lifecycle, and common failure modes.

## Authentication Methods

Bridge Watch currently supports API-key authentication for protected REST endpoints.

### API key header

Send your key in the `x-api-key` header.

```bash
curl -X GET http://localhost:3000/api/v1/jobs/status \
  -H "x-api-key: $BRIDGE_WATCH_API_KEY"
```

Protected routes return `401` if the header is missing and `403` if the key is invalid or lacks required scope.

### Bootstrap token (admin fallback)

If `API_KEY_BOOTSTRAP_TOKEN` is configured, it is treated as a privileged bootstrap credential with wildcard scope (`*`).

Use this only for initial environment setup and emergency recovery. Replace with managed API keys as soon as possible.

## Scope Model

Bridge Watch enforces allow-list scopes at route level. A key must include every scope required by the target route.

### Scope matching rules

- `requiredScopes` empty: any authenticated key is accepted.
- exact match: key must contain each required scope.
- wildcard: keys with `*` satisfy all scope checks.

### Common scope examples

| Scope | Typical routes |
|---|---|
| `admin:api-keys` | `/api/v1/api-keys/*`, `/api/v1/admin/alert-routing/*` |
| `assets:write` | write operations on `/api/v1/assets/*` |
| `admin:audit` | audit read endpoints |
| `admin:config` | audit/config admin mutations |
| `jobs:trigger` | job trigger endpoints |
| `jobs:read` | job status/read endpoints |

## Token and Key Lifecycle

Managed API keys are created through the API key routes and persisted hashed + salted. Plaintext keys are shown only at issuance or rotation.

### Create

```bash
curl -X POST http://localhost:3000/api/v1/api-keys \
  -H "x-api-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ops-integration",
    "scopes": ["jobs:read", "jobs:trigger"],
    "rateLimitPerMinute": 120,
    "expiresInDays": 30
  }'
```

### Rotate

```bash
curl -X POST http://localhost:3000/api/v1/api-keys/<key-id>/rotate \
  -H "x-api-key: $ADMIN_KEY"
```

### Revoke

```bash
curl -X POST http://localhost:3000/api/v1/api-keys/<key-id>/revoke \
  -H "x-api-key: $ADMIN_KEY"
```

### Extend expiry

```bash
curl -X POST http://localhost:3000/api/v1/api-keys/<key-id>/extend \
  -H "x-api-key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"extraDays": 14}'
```

## Error Cases

| Status | Error | Typical cause | Action |
|---|---|---|---|
| `401` | `Unauthorized` | Missing `x-api-key` header | Send key in `x-api-key` |
| `403` | `Forbidden` | Invalid key, revoked/expired key, or missing scope | Verify key value and assigned scopes |
| `429` | `Too Many Requests` | Per-key rate limit exceeded | Back off and retry after cooldown |

### Example responses

```json
{
  "error": "Unauthorized",
  "message": "Missing API key. Provide it via the x-api-key header."
}
```

```json
{
  "error": "Forbidden",
  "message": "Invalid API key or missing required scope."
}
```

```json
{
  "error": "Too Many Requests",
  "message": "API key rate limit exceeded"
}
```

## Best Practices

- issue one key per integration or workload; do not share keys across teams.
- assign minimum scopes needed for each integration.
- set expirations for non-human keys and automate renewal/rotation.
- rotate immediately after any suspected leak.
- store keys in secret managers, not source code or plain-text config files.
- monitor 401/403/429 patterns to detect misconfiguration and abuse.
- reserve `API_KEY_BOOTSTRAP_TOKEN` for break-glass scenarios only.

## Related Documentation

- API architecture: [architecture/api-architecture.md](./architecture/api-architecture.md)
- API changelog: [API_CHANGELOG.md](./API_CHANGELOG.md)
- Runbook index: [runbooks/index.md](./runbooks/index.md)