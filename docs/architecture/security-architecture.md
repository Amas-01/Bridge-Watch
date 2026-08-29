# Security Architecture

Security model, authentication, authorization, and threat mitigation for Stellar Bridge Watch.

## Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    Security Architecture                     │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Layer 1: Network Security                           │   │
│  │  • TLS/SSL encryption (HTTPS, WSS)                   │   │
│  │  • Network policies (Kubernetes)                     │   │
│  │  • Firewall rules (expose only 80/443)               │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Layer 2: Application Security                       │   │
│  │  • Rate limiting (sliding window)                    │   │
│  │  • API key authentication                            │   │
│  │  • Request validation (Fastify schema)               │   │
│  │  • CORS policy                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Layer 3: Data Security                              │   │
│  │  • Parameterized queries (Knex)                      │   │
│  │  • Input sanitization                                │   │
│  │  • Secret management (env vars, K8s secrets)         │   │
│  │  • Non-root container execution                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Layer 4: Smart Contract Security                    │   │
│  │  • Access control lists (ACL)                        │   │
│  │  • Circuit breaker mechanism                         │   │
│  │  • Rate limiting (on-chain)                          │   │
│  │  • Multi-signature treasury                          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Authentication

### API Key Authentication

API keys are used for authenticated endpoints (alert management, preferences, admin routes):

- **Generation:** Via `/api/v1/api-keys` endpoint or admin tools
- **Transmission:** `Authorization: Bearer <api-key>` header
- **Validation:** `auth.ts` middleware verifies key against database
- **Scoping:** Keys can be scoped to specific operations

### Public Endpoints

The following endpoints are accessible without authentication:
- Health check endpoints (`/health/*`)
- Asset listing and metadata (`/api/v1/assets/*`)
- Bridge status (`/api/v1/bridges/*`)
- Analytics read endpoints (`/api/v1/analytics/*`)

## Authorization

### Role-Based Access

| Role | Capabilities |
|------|-------------|
| **Public** | Read asset, bridge, price, and analytics data |
| **Authenticated** | Create alert rules, manage watchlists, set preferences |
| **Admin** | Rate limit management, tracing, validation, cache control |

### Smart Contract ACL

The Soroban contracts implement access control:
- **Owner** — Full contract management
- **Admin** — Asset registry, circuit breaker control
- **Operator** — Bridge operations, verification submissions
- **Public** — Read-only queries

## Rate Limiting

### Implementation

- **Algorithm:** Sliding window counter
- **Storage:** Redis (per IP and per API key)
- **Default limit:** 100 requests per minute
- **Burst:** 2x multiplier for short spikes
- **Configuration:** `RATE_LIMIT_MAX`, `RATE_LIMIT_BURST_MULTIPLIER`

### Response Headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1711713660
```

When exceeded, returns `429 Too Many Requests`.

## Input Validation

### Request Validation

Fastify schema validation on all routes:
- Path parameters (asset symbols, bridge IDs)
- Query parameters (pagination, date ranges, filters)
- Request bodies (alert rules, preferences, configuration)

Validation schemas are defined in `backend/src/api/validations/`.

### SQL Injection Prevention

- All database queries use **Knex query builder** with parameterized queries
- No raw SQL string concatenation
- Knex automatically escapes all values

### XSS Prevention

- JSON API responses (no HTML rendering on backend)
- React's built-in JSX escaping on the frontend
- `X-Content-Type-Options: nosniff` header via Nginx

## Transport Security

### HTTPS/WSS

- TLS 1.2+ required for all production traffic
- HTTP redirects to HTTPS
- WebSocket connections upgrade to WSS in production
- HSTS headers enabled

See [SSL/TLS Setup](../deployment/ssl-tls-setup.md) for configuration details.

### Security Headers

Applied by Nginx in production:

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `X-Frame-Options` | `DENY` | Prevent clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-XSS-Protection` | `1; mode=block` | XSS filter |

## Container Security

### Non-Root Execution

Both backend and frontend containers run as non-root users:
- **Backend:** `appuser` user
- **Frontend:** `nginx` user

### Multi-Stage Builds

Docker images use multi-stage builds to minimize attack surface:
- Development dependencies are not included in production images
- Source code is not included — only compiled output
- Minimal base images (`node:20-slim`, `nginx:1.27-alpine`)

## Secret Management

### Principles

1. Secrets are **never committed** to version control
2. Environment variables for runtime configuration
3. Kubernetes Secrets for orchestrated deployments
4. Cloud secret managers for production (AWS Secrets Manager, GCP Secret Manager, Vault)

### Secret Rotation

- Database passwords should be rotated quarterly
- API keys can be regenerated through the admin endpoint
- Redis password changes require service restart

See [Environment Setup](../deployment/environment-setup.md) for secrets configuration.  
For periodic inventory and exposure review, use the [Secrets Audit Checklist](../secrets-audit-checklist.md) and [Secret Rotation Playbook](../runbooks/secret-rotation-playbook.md).

## Network Security

### Kubernetes Network Policies

In Kubernetes deployments, network policies restrict traffic flow:
- Backend pods only accept traffic from frontend pods and ingress
- Database pods only accept traffic from backend pods
- Redis pods only accept traffic from backend pods
- Outbound traffic to external APIs is allowed on port 443 only

See [Kubernetes Deployment](../deployment/kubernetes-deployment.md) for network policy manifests.

### Docker Network Isolation

In Docker Compose deployments:
- All services communicate on a private `bridge-watch` network
- Only necessary ports are exposed to the host
- Admin tools (PgAdmin, Redis Commander) are behind the `tools` profile in production

## Smart Contract Security

### Circuit Breaker

Automatic protection mechanism:
- Activates when health score drops below configured threshold
- Pauses sensitive operations until conditions improve
- Can be manually triggered by authorized administrators
- Whitelist for addresses exempt from pauses

### On-Chain Rate Limiting

Prevents spam and abuse of smart contract functions via `rate_limiter.rs`.

### Multi-Signature Treasury

The `multisig_treasury.rs` module requires multiple signatures for fund movements, preventing single-point-of-failure in treasury operations.

## CI/CD Security

### GitHub Actions Checks

| Workflow | Security Checks |
|----------|----------------|
| `ci.yml` | Lint, build, test (backend, frontend, contracts) |
| `security.yml` | Dependency vulnerability scanning |
| `code-quality.yml` | Code quality analysis |
| `integration-tests.yml` | Integration test suite |

### Dependency Scanning

- `security.yml` workflow scans for known vulnerabilities
- `dependency-update.yml` automates dependency updates
- `npm audit` and `cargo audit` run in CI pipeline

## Security Reporting

Security vulnerabilities should be reported via email to **security@stellarbridgewatch.io** — not through public issues. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the responsible disclosure policy.
