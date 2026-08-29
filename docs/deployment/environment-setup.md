# Environment Setup

This guide covers environment variable configuration, secrets management, and configuration for all deployment environments.

## Environment Variables

Bridge Watch uses environment variables for all runtime configuration. A `.env.example` file is provided in the repository root.

### Quick Setup

```bash
# Copy the example file
cp .env.example .env

# Edit with your values
nano .env
```

### Complete Variable Reference

#### Application

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | `development` | Yes | `development`, `staging`, or `production` |
| `PORT` | `3001` | No | Backend HTTP API port |
| `WS_PORT` | `3002` | No | WebSocket server port |
| `LOG_LEVEL` | `info` | No | Pino log level: `debug`, `info`, `warn`, `error` |

#### Database (PostgreSQL + TimescaleDB)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `POSTGRES_HOST` | `localhost` | Yes | Database hostname |
| `POSTGRES_PORT` | `5432` | No | Database port |
| `POSTGRES_DB` | `bridge_watch` | Yes | Database name |
| `POSTGRES_USER` | `bridge_watch` | Yes | Database user |
| `POSTGRES_PASSWORD` | `bridge_watch_dev` | Yes | Database password |

#### Redis

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `REDIS_HOST` | `localhost` | Yes | Redis hostname |
| `REDIS_PORT` | `6379` | No | Redis port |
| `REDIS_PASSWORD` | *(empty)* | No | Redis password (recommended for production) |

#### Rate Limiting

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `RATE_LIMIT_MAX` | `100` | No | Maximum requests per minute |
| `RATE_LIMIT_BURST_MULTIPLIER` | `2` | No | Burst multiplier above the rate limit |

#### Health Check Configuration

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `HEALTH_CHECK_TIMEOUT_MS` | `5000` | No | Health check timeout in milliseconds |
| `HEALTH_CHECK_MEMORY_THRESHOLD` | `90` | No | Memory usage threshold percentage |
| `HEALTH_CHECK_DISK_THRESHOLD` | `80` | No | Disk usage threshold percentage |

#### External APIs

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `STELLAR_HORIZON_URL` | `https://horizon.stellar.org` | No | Stellar Horizon API URL |
| `SOROBAN_RPC_URL` | `https://soroban-rpc.stellar.org` | No | Soroban RPC endpoint |
| `CIRCLE_API_KEY` | *(empty)* | No | Circle API key for USDC/EURC data |
| `CIRCLE_API_TIMEOUT` | `5000` | No | Circle API request timeout (ms) |
| `ETHEREUM_RPC_URL` | *(empty)* | No | Ethereum RPC for bridge verification |

#### Frontend

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `VITE_API_URL` | `http://localhost:3001` | No | Backend API URL for frontend |
| `VITE_WS_URL` | `ws://localhost:3002` | No | WebSocket URL for frontend |
| `FRONTEND_PORT` | `80` (prod) / `5173` (dev) | No | Frontend serving port |

#### Admin Tools (Development)

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PGADMIN_EMAIL` | `admin@bridgewatch.dev` | No | PgAdmin login email |
| `PGADMIN_PASSWORD` | `admin` | No | PgAdmin login password |
| `PGADMIN_PORT` | `5050` | No | PgAdmin web UI port |
| `REDIS_COMMANDER_USER` | `admin` | No | Redis Commander username |
| `REDIS_COMMANDER_PASSWORD` | `admin` | No | Redis Commander password |
| `REDIS_COMMANDER_PORT` | `8081` | No | Redis Commander port |

## Environment-Specific Configuration

### Development

```bash
NODE_ENV=development
LOG_LEVEL=debug
POSTGRES_HOST=localhost
POSTGRES_PASSWORD=bridge_watch_dev
REDIS_HOST=localhost
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3002
```

### Staging

```bash
NODE_ENV=staging
LOG_LEVEL=info
POSTGRES_HOST=staging-db.internal
POSTGRES_PASSWORD=<staging-password>
REDIS_HOST=staging-redis.internal
REDIS_PASSWORD=<staging-redis-password>
VITE_API_URL=https://staging-api.bridgewatch.dev
VITE_WS_URL=wss://staging-api.bridgewatch.dev/ws
```

### Production

```bash
NODE_ENV=production
LOG_LEVEL=warn
POSTGRES_HOST=prod-db.internal
POSTGRES_PASSWORD=<strong-production-password>
REDIS_HOST=prod-redis.internal
REDIS_PASSWORD=<strong-redis-password>
RATE_LIMIT_MAX=200
HEALTH_CHECK_MEMORY_THRESHOLD=85
VITE_API_URL=https://api.bridgewatch.dev
VITE_WS_URL=wss://api.bridgewatch.dev/ws
```

## Secrets Management

### General Principles

- **Never commit secrets** to version control.
- Use environment-specific `.env` files that are `.gitignore`'d.
- Rotate secrets regularly, especially database and API credentials.
- Use the principle of least privilege for all service accounts.
- Run the quarterly [secrets audit checklist](../secrets-audit-checklist.md).

### Docker Compose Secrets

For Docker Compose deployments, use Docker secrets or an `.env` file:

```bash
# Create .env from template
cp .env.example .env

# Generate strong passwords
openssl rand -base64 32  # Use output for POSTGRES_PASSWORD
openssl rand -base64 32  # Use output for REDIS_PASSWORD
```

### Kubernetes Secrets

For Kubernetes deployments, store secrets using Kubernetes Secret resources:

```bash
# Create secret from literal values
kubectl create secret generic bridge-watch-secrets \
  --namespace bridge-watch \
  --from-literal=postgres-host=prod-db.internal \
  --from-literal=postgres-password=$(openssl rand -base64 32) \
  --from-literal=redis-password=$(openssl rand -base64 32) \
  --from-literal=circle-api-key=<your-circle-api-key>
```

```yaml
# Or define as YAML (values must be base64-encoded)
apiVersion: v1
kind: Secret
metadata:
  name: bridge-watch-secrets
  namespace: bridge-watch
type: Opaque
data:
  postgres-password: <base64-encoded-password>
  redis-password: <base64-encoded-password>
  circle-api-key: <base64-encoded-key>
```

### Cloud Provider Secret Managers

For production deployments, consider integrating with cloud-native secret managers:

| Provider | Service | Integration |
|----------|---------|-------------|
| AWS | Secrets Manager | Use `aws-sdk` or CSI driver |
| GCP | Secret Manager | Use `@google-cloud/secret-manager` |
| Azure | Key Vault | Use `@azure/keyvault-secrets` |
| HashiCorp | Vault | Use Vault Agent or CSI driver |

### Environment Variable Validation

The backend validates required environment variables at startup. If critical variables are missing or invalid, the application will fail to start with a clear error message indicating which variable needs attention.
