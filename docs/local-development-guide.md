# Local Development Guide

This guide walks you through running the full Bridge Watch stack locally, from first clone to a working dev environment.

---

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 20.x | Use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm) |
| npm | 9.x (bundled with Node 20) | |
| Docker | 24.x | |
| Docker Compose | v2 plugin | `docker compose` (not `docker-compose`) |
| Git | any recent | |
| Rust + Cargo | stable | Only needed for contract work |
| Stellar CLI | latest | Only needed for contract work |

Verify your setup:

```bash
node -v        # >= 20.0.0
docker -v
docker compose version
```

---

## Quick Start (automated)

The repo ships a setup script that handles everything in one shot:

```bash
# Full setup (installs deps, starts Docker services, runs migrations + seeds)
npm run setup

# Skip contract build and IDE config for a faster first run
npm run setup:quick
```

The script accepts flags if you need more control:

```bash
bash scripts/setup.sh --skip-contracts   # skip Rust/Soroban build
bash scripts/setup.sh --skip-db          # skip migrations and seeding
bash scripts/setup.sh --reset-db         # wipe DB volume and re-initialize
bash scripts/setup.sh --docker-only      # only start Docker services
bash scripts/setup.sh -y                 # skip all confirmation prompts
```

If you prefer to do things manually, follow the sections below.

---

## Manual Setup

### 1. Fork and clone

```bash
# Fork on GitHub first, then:
git clone https://github.com/<your-username>/Bridge-Watch.git
cd Bridge-Watch
git checkout -b feature/your-branch-name
```

### 2. Environment variables

```bash
cp .env.example .env
```

The defaults in `.env.example` work out of the box for local Docker development. The only values you may want to fill in for full functionality:

| Variable | Purpose | Required for |
|----------|---------|-------------|
| `ETHEREUM_RPC_URL` | Ethereum mainnet RPC | EVM bridge monitoring |
| `POLYGON_RPC_URL` | Polygon RPC | Polygon bridge monitoring |
| `BASE_RPC_URL` | Base RPC | Base bridge monitoring |
| `CIRCLE_API_KEY` | Circle price feeds | Price aggregation |
| `COINBASE_API_KEY` / `COINBASE_API_SECRET` | Coinbase price feeds | Price aggregation |
| `SMTP_*` | Email alerts | Alert notifications |
| `DISCORD_BOT_TOKEN` | Discord alerts | Discord notifications |

Everything else (database, Redis, Stellar testnet) works with the defaults.

### 3. Install dependencies

```bash
npm install
```

This installs dependencies for both `backend` and `frontend` workspaces.

### 4. Start infrastructure services

```bash
# Development compose — includes hot reload, PgAdmin, and Redis Commander
docker compose -f docker-compose.dev.yml up -d postgres redis
```

Wait for both containers to be healthy:

```bash
docker compose -f docker-compose.dev.yml ps
```

### 5. Run database migrations

```bash
cd backend
npm run migrate
```

Check migration status at any time:

```bash
npm run migrate:status
```

### 6. Seed the database

```bash
npm run seed
```

This populates assets, bridges, and sample data for local development.

---

## Starting the Application

### Option A — Docker Compose (recommended for full-stack)

Runs backend and frontend inside containers with hot reload:

```bash
docker compose -f docker-compose.dev.yml up
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:3001 |
| WebSocket | ws://localhost:3002 |
| PgAdmin | http://localhost:5050 (admin@bridgewatch.dev / admin) |
| Redis Commander | http://localhost:8081 (admin / admin) |

### Option B — Run processes directly (faster iteration)

Start infrastructure via Docker, then run backend and frontend natively:

```bash
# Terminal 1 — infrastructure only
docker compose -f docker-compose.dev.yml up -d postgres redis

# Terminal 2 — backend with hot reload
npm run dev:backend

# Terminal 3 — frontend with HMR
npm run dev:frontend
```

The backend starts on port `3001`, frontend on `5173`.

---

## Contract Workflow (Soroban / Rust)

Only needed if you're working on the Soroban smart contracts.

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Add the WebAssembly target
rustup target add wasm32-unknown-unknown

# Install Stellar CLI
cargo install --locked stellar-cli --features opt
```

### Build contracts

```bash
cd contracts
cargo build --release
```

The workspace contains two members:
- `soroban` — main bridge contract
- `transfer_state_machine` — transfer state management

### Contract SDK

The TypeScript SDK wrapping the contracts lives in `sdk/`:

```bash
cd sdk
npm install
npm run build
```

---

## Monitoring Stack (optional)

Prometheus, Grafana, Loki, Tempo, and Alertmanager are available for local observability work.

```bash
cd monitoring
docker compose up -d
```

| Service | URL | Credentials |
|---------|-----|-------------|
| Grafana | http://localhost:3000 | admin / admin |
| Prometheus | http://localhost:9090 | — |
| Alertmanager | http://localhost:9093 | — |
| Loki | http://localhost:3100 | — |
| Tempo | http://localhost:3200 | — |

The backend exposes metrics at `http://localhost:3001/metrics` (Prometheus format).

Alternatively, the backend-only monitoring stack (lighter):

```bash
cd backend
docker compose -f docker-compose.monitoring.yml up -d
```

---

## Running Tests

```bash
# All tests
npm test

# Backend only
npm run test:backend

# Frontend only
cd frontend && npm test

# With coverage
cd backend && npm run test:coverage

# E2E tests (requires running stack)
npm run test:e2e
```

---

## Useful Commands

```bash
# Generate OpenAPI docs
cd backend && npm run docs:generate

# Lint
npm run lint

# Create a new migration
cd backend && npm run migrate:make -- <migration_name>

# Roll back last migration
cd backend && npm run migrate:down

# Roll back everything
cd backend && npm run migrate:rollback:all
```

---

## Debugging Tips

### Backend

The backend uses [Pino](https://getpino.io) for structured logging. Set `LOG_LEVEL=debug` in `.env` for verbose output.

```bash
LOG_LEVEL=debug npm run dev:backend
```

The API is self-documented via Swagger UI at `http://localhost:3001/documentation`.

To inspect the database directly, use PgAdmin at `http://localhost:5050` — it auto-connects to the local PostgreSQL instance.

### Frontend

The frontend is a Vite + React app. The browser DevTools Network tab is your best friend. React Query DevTools are included in development mode.

### WebSocket

Connect to `ws://localhost:3002` to inspect real-time events. Use a tool like [websocat](https://github.com/vi/websocat) or the browser console:

```js
const ws = new WebSocket('ws://localhost:3002');
ws.onmessage = (e) => console.log(JSON.parse(e.data));
```

### Docker logs

```bash
docker compose -f docker-compose.dev.yml logs -f backend
docker compose -f docker-compose.dev.yml logs -f frontend
```

---

## Common Pitfalls

**Port conflicts** — The stack uses ports 3001, 3002, 5173, 5432, 6379, 5050, 8081. If any are in use, override them in `.env`:

```bash
PORT=3011
FRONTEND_PORT=5174
POSTGRES_PORT=5433
```

**`docker compose` vs `docker-compose`** — This project requires Docker Compose v2 (`docker compose` as a plugin). The legacy `docker-compose` binary may not work.

**Node version mismatch** — The backend requires Node 20+. If you see syntax errors on startup, check `node -v`.

**Migration lock stuck** — If a migration crashes mid-run, the lock may not release. Fix it with:

```bash
cd backend && npm run migrate:unlock
```

**TimescaleDB extension missing** — The `timescale/timescaledb:latest-pg15` image handles this automatically. If you're connecting an external PostgreSQL instance, you need to install the TimescaleDB extension manually.

**`POSTGRES_HOST` mismatch** — When running the backend natively (Option B), `POSTGRES_HOST` must be `localhost`. When running inside Docker Compose, it must be `postgres` (the service name). The `.env.example` defaults to `localhost` for native runs.

**Seeding in production** — The seed script blocks on `NODE_ENV=production` unless you pass `--force`. Never run seeds against production data.

---

## Cleanup

Stop and remove all containers:

```bash
docker compose -f docker-compose.dev.yml down
```

Remove containers and all data volumes (full reset):

```bash
docker compose -f docker-compose.dev.yml down -v
```

Remove monitoring stack:

```bash
cd monitoring && docker compose down -v
```

---

## Service Overview

| Service | Tech | Port | Purpose |
|---------|------|------|---------|
| Backend | Fastify + TypeScript | 3001 | REST API, background jobs, WebSocket |
| Frontend | React + Vite | 5173 | Dashboard UI |
| PostgreSQL | TimescaleDB 15 | 5432 | Primary database + time-series data |
| Redis | Redis 7 | 6379 | Caching, job queues (BullMQ) |
| Prometheus | — | 9090 | Metrics collection |
| Grafana | — | 3000 | Dashboards |
| Loki | — | 3100 | Log aggregation |
| Tempo | — | 3200 | Distributed tracing |
| Alertmanager | — | 9093 | Alert routing |

---

## Further Reading

- `backend/METRICS_QUICKSTART.md` — metrics and Prometheus setup
- `backend/docs/API.md` — API reference
- `backend/docs/websocket-protocol.md` — WebSocket event protocol
- `backend/docs/caching-strategy.md` — Redis caching patterns
- `monitoring/README.md` — full observability stack details
- `backend/grafana/README.md` — Grafana dashboard setup
