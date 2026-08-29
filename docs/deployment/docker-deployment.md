# Docker Deployment Guide

This guide covers deploying Stellar Bridge Watch using Docker and Docker Compose for development and production environments.

## Architecture

Bridge Watch uses a multi-container architecture with Docker Compose:

```
┌──────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                   (bridge-watch)                         │
│                                                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────────────┐   │
│  │ Frontend   │  │ Backend   │  │ Background Workers│   │
│  │ (Nginx)    │  │ (Fastify) │  │ (BullMQ)          │   │
│  │ :80        │  │ :3001     │  │                    │   │
│  │            │  │ WS:3002   │  │                    │   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬──────────────┘  │
│        │              │               │                  │
│  ┌─────▼──────────────▼───────────────▼──────────────┐  │
│  │              Service Dependencies                  │  │
│  │                                                    │  │
│  │  ┌──────────────┐        ┌──────────────┐         │  │
│  │  │  PostgreSQL   │        │    Redis     │         │  │
│  │  │  TimescaleDB  │        │    7-alpine  │         │  │
│  │  │  :5432        │        │    :6379     │         │  │
│  │  └──────────────┘        └──────────────┘         │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              Optional Tools (--profile tools)      │  │
│  │                                                    │  │
│  │  ┌──────────────┐        ┌──────────────────┐     │  │
│  │  │   PgAdmin    │        │ Redis Commander  │     │  │
│  │  │   :5050      │        │ :8081            │     │  │
│  │  └──────────────┘        └──────────────────┘     │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## Development Deployment

### Start Development Environment

```bash
# Using Make (recommended)
make dev

# Or using Docker Compose directly
docker compose -f docker-compose.dev.yml up
```

This starts all services with hot reload:
- **Backend** — `tsx watch` with source code mounted as volumes
- **Frontend** — Vite dev server with HMR on port 5173
- **PostgreSQL** — TimescaleDB on port 5432
- **Redis** — On port 6379
- **PgAdmin** — Database management UI on port 5050
- **Redis Commander** — Redis UI on port 8081

### Development Services

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:5173 | Vite dev server with HMR |
| Backend API | http://localhost:3001 | REST API |
| WebSocket | ws://localhost:3002 | Real-time updates |
| PgAdmin | http://localhost:5050 | Database management |
| Redis Commander | http://localhost:8081 | Redis management |

### Rebuild Development Images

```bash
# Rebuild after Dockerfile changes
make dev-build

# Or
docker compose -f docker-compose.dev.yml up --build
```

### View Logs

```bash
make logs           # All services
make logs-backend   # Backend only
make logs-frontend  # Frontend only
```

### Stop Development Environment

```bash
make dev-down
```

## Production Deployment

### Step 1: Configure Environment

```bash
# Create production .env file
cp .env.example .env

# Generate strong passwords
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)

# Edit .env with production values
nano .env
```

Key production settings:

```bash
NODE_ENV=production
POSTGRES_PASSWORD=<generated-strong-password>
REDIS_PASSWORD=<generated-strong-password>
RATE_LIMIT_MAX=200
HEALTH_CHECK_MEMORY_THRESHOLD=85
```

### Step 2: Build Production Images

```bash
# Build all images
make build

# Or build individually
docker compose build backend
docker compose build frontend
```

The multi-stage Dockerfiles optimize production images:
- **Backend** — Compiles TypeScript, includes only `dist/` and production `node_modules`
- **Frontend** — Builds with Vite, served by Nginx 1.27

### Step 3: Run Database Migrations

```bash
# Start database services first
docker compose up -d postgres redis

# Wait for healthy status
docker compose ps

# Run migrations
make migrate
```

### Step 4: Start All Services

```bash
# Start in detached mode
make up

# Or with admin tools
make up-tools

# Or directly
docker compose up -d
```

### Step 5: Verify Deployment

```bash
# Check all containers are running
docker compose ps

# Verify health endpoints
curl http://localhost:3001/health
curl http://localhost:3001/health/ready
curl http://localhost:3001/health/detailed

# Check frontend
curl -I http://localhost:80

# View logs for issues
docker compose logs --tail=50
```

## Container Details

### Backend Container

- **Base image:** `node:20-slim`
- **Build stages:** `base` → `dev` | `builder` → `production`
- **Production user:** `appuser` (non-root)
- **Health check:** `GET /health` every 30s
- **Startup period:** 60 seconds allowed

### Frontend Container

- **Build stages:** `base` → `dev` | `builder` → `production`
- **Production server:** Nginx 1.27
- **Production user:** `nginx` (non-root)
- **Health check:** `GET /` every 30s
- **Nginx routing:**
  - `/api/*` → Proxied to `backend:3001`
  - `/api/v1/ws` → Proxied to `backend:3002` (WebSocket upgrade)
  - Static assets → Cached for 1 year (content-addressed with Vite hashes)
  - All other routes → SPA fallback to `index.html`

### PostgreSQL Container

- **Image:** `timescale/timescaledb:latest-pg15`
- **Volume:** `postgres_data` at `/var/lib/postgresql/data`
- **Initialization:** `scripts/init-db.sql` runs on first start
- **Health check:** `pg_isready` every 10s

### Redis Container

- **Image:** `redis:7-alpine`
- **Volume:** `redis_data` at `/data`
- **Password:** Optional, configured via `REDIS_PASSWORD`
- **Health check:** `redis-cli ping` every 10s

## Docker Layer Tuning

Both the backend and frontend Dockerfiles are ordered so dependency
installation happens before source code is copied in:

```dockerfile
WORKDIR /app
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm npm install
# source is copied / mounted afterwards
```

This matters for two reasons:

- **Small rebuilds during development** — editing application source under
  `src/` only invalidates the layers *after* `npm install`. The dependency
  layer is reused from cache as long as `package.json` hasn't changed, so a
  typical code change rebuild only re-runs the TypeScript build (or, in the
  `dev` stage, nothing — source is bind-mounted, not copied).
- **Cache efficiency across environments** — the `RUN --mount=type=cache,target=/root/.npm`
  cache mount persists npm's package cache across builds, independent of the
  layer cache. Even when `package.json` *does* change and the install layer is
  invalidated, npm reuses already-downloaded packages instead of re-fetching
  them from the registry. This works the same way locally (`docker build`,
  `docker compose build`) and in CI.

In CI, [`.github/workflows/docker.yml`](../../.github/workflows/docker.yml)
builds with `cache-from: type=gha` / `cache-to: type=gha,mode=max`, which
persists both the layer cache and the BuildKit cache-mount contents between
workflow runs — so a CI rebuild after a small source change is just as cheap
as a local incremental rebuild.

`.dockerignore` (present in both `backend/` and `frontend/`) keeps
`node_modules`, `dist`, test files, and docs out of the build context so they
never trigger spurious cache invalidation or get sent to the Docker daemon.

## Volume Management

### Persistent Volumes

| Volume | Service | Purpose |
|--------|---------|---------|
| `postgres_data` | PostgreSQL | Database files |
| `redis_data` | Redis | Cache persistence |
| `pgadmin_data` | PgAdmin | PgAdmin configuration |

### Development Volumes

| Volume | Service | Purpose |
|--------|---------|---------|
| `backend_node_modules` | Backend | Isolated container dependencies |
| `frontend_node_modules` | Frontend | Isolated container dependencies |

### Clean Up Volumes

```bash
# Stop services and remove volumes (DESTRUCTIVE — destroys data)
make clean

# Remove only dangling images
make prune
```

## Updating

### Update to Latest Version

```bash
# Pull latest code
git pull origin main

# Rebuild images
make build

# Restart services (database data persists)
docker compose down
docker compose up -d

# Run any new migrations
make migrate
```

### Zero-Downtime Updates

For production environments with minimal downtime:

```bash
# Build new images
docker compose build

# Rolling restart (one service at a time)
docker compose up -d --no-deps backend
docker compose up -d --no-deps frontend
```

## Resource Limits

For production deployments, consider adding resource limits:

```yaml
# In docker-compose.yml service definition
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: "1.0"
          memory: 512M
        reservations:
          cpus: "0.25"
          memory: 256M
```

## Docker Network

All services communicate over a single bridge network (`bridge-watch`). Service names are used as hostnames:

- `postgres` — Database
- `redis` — Cache
- `backend` — API server
- `frontend` — Web server
