# Development Environment Setup

This guide covers setting up the Bridge Watch development environment from scratch. You can use the **automated setup script** or follow the manual steps below.

## Table of Contents

1. [Quick Start (Automated)](#quick-start-automated)
2. [Prerequisites](#prerequisites)
3. [Manual Setup](#manual-setup)
4. [Setup Script Reference](#setup-script-reference)
5. [Architecture Overview](#architecture-overview)
6. [Running the Application](#running-the-application)
7. [Common Tasks](#common-tasks)
8. [Troubleshooting](#troubleshooting)
9. [Platform-Specific Notes](#platform-specific-notes)

---

## Quick Start (Automated)

The fastest way to get started:

```bash
# Clone the repository
git clone https://github.com/StellaBridge/Bridge-Watch.git
cd Bridge-Watch

# Run the setup script
./scripts/setup.sh

# Start the dev environment
make dev
```

The setup script checks prerequisites, installs dependencies, configures `.env`, starts Docker services, runs database migrations and seeds, builds Soroban contracts, and generates IDE configuration — all in one command.

---

## Prerequisites

| Tool               | Minimum Version | Required For        | Install Guide                                      |
| ------------------ | --------------- | ------------------- | -------------------------------------------------- |
| **Git**            | any             | Version control     | https://git-scm.com/downloads                      |
| **Node.js**        | 20.0.0          | Backend + Frontend  | https://nodejs.org/ or use [nvm](https://github.com/nvm-sh/nvm) |
| **npm**            | (bundled)       | Package management  | Comes with Node.js                                 |
| **Docker**         | 20+             | Services (DB, Redis)| https://docs.docker.com/get-docker/                |
| **Docker Compose** | v2+             | Service orchestration | Bundled with Docker Desktop                      |
| **Rust** (optional)| latest stable   | Soroban contracts   | https://rustup.rs/                                 |

### Installing Prerequisites

#### macOS

```bash
# Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js 20
brew install node@20

# Docker Desktop
brew install --cask docker

# Rust (optional, for contracts)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
```

#### Linux (Ubuntu/Debian)

```bash
# Node.js 20 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect

# Rust (optional)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown
```

#### Windows (WSL2)

1. Install [WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) with Ubuntu
2. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) with WSL2 backend enabled
3. Inside WSL2, follow the Linux instructions above

> **Note:** The setup script and Makefile are designed for Bash. On Windows, use WSL2 or Git Bash.

---

## Manual Setup

If you prefer to set up manually instead of using the script:

### 1. Clone and Enter Repository

```bash
git clone https://github.com/StellaBridge/Bridge-Watch.git
cd Bridge-Watch
```

### 2. Environment Variables

```bash
cp .env.example .env
# Edit .env to add your API keys (Circle, Coinbase, Infura, etc.)
```

The default values in `.env.example` work for local development. External API keys are only needed if you want live data from Circle, Coinbase, or Ethereum RPCs.

### 3. Install Dependencies

```bash
# Installs root + backend + frontend workspaces
npm install
```

### 4. Start Docker Services

```bash
# Start PostgreSQL (TimescaleDB) and Redis
docker compose -f docker-compose.dev.yml up -d postgres redis

# Verify they're healthy
docker compose -f docker-compose.dev.yml ps
```

### 5. Initialize Database

```bash
# Run Knex migrations
npm run migrate --workspace=backend

# Load seed data
npm run seed --workspace=backend
```
### Database backups

Weekly automated backups of the TimescaleDB schema and data run via
`.github/workflows/db-backup.yml` and upload to S3. To run or test the
backup/restore pipeline locally, see
[docs/database-backup-restore.md](database-backup-restore.md).

### 6. Build Contracts (Optional)

```bash
cd contracts
rustup target add wasm32-unknown-unknown
cargo build
cargo test
cd ..
```

### 7. Start Development

```bash
# Option A: Full Docker dev environment (recommended)
make dev

# Option B: Native Node.js (requires Docker services running)
npm run dev
```

---

## Setup Script Reference

```
Usage: ./scripts/setup.sh [OPTIONS]
```

### Options

| Flag                | Description                                         |
| ------------------- | --------------------------------------------------- |
| `--skip-docker`     | Skip Docker services startup                        |
| `--skip-db`         | Skip database migrations and seeding                |
| `--skip-contracts`  | Skip Rust/Soroban contract build                    |
| `--skip-ide`        | Skip IDE configuration generation                   |
| `--skip-deps`       | Skip npm dependency installation                    |
| `--contracts-only`  | Only build Rust/Soroban contracts                   |
| `--docker-only`     | Only start Docker services (postgres + redis)       |
| `--reset-db`        | Tear down DB volume and re-initialize from scratch  |
| `--no-color`        | Disable colored output                              |
| `--yes`, `-y`       | Skip all confirmation prompts                       |
| `--help`, `-h`      | Show help message                                   |

### Examples

```bash
# Full setup with no prompts
./scripts/setup.sh -y

# Skip contracts (no Rust installed)
./scripts/setup.sh --skip-contracts

# Only start Docker services
./scripts/setup.sh --docker-only

# Reset database and re-seed
./scripts/setup.sh --reset-db -y

# CI-friendly (no color, no prompts, skip IDE)
./scripts/setup.sh --no-color --yes --skip-ide --skip-contracts
```

---

## Architecture Overview

```
Bridge-Watch/
├── backend/            # Fastify API + background workers (TypeScript)
│   ├── src/
│   │   ├── api/        # Route handlers
│   │   ├── config/     # Database, app configuration
│   │   ├── database/   # Knex migrations + seeds
│   │   ├── jobs/       # BullMQ job definitions
│   │   ├── services/   # Business logic
│   │   ├── utils/      # Shared utilities
│   │   └── workers/    # Background worker processes
│   └── tests/
├── frontend/           # React dashboard (TypeScript, Vite)
│   └── src/
│       ├── components/ # UI components
│       ├── hooks/      # Custom React hooks
│       ├── pages/      # Route pages
│       └── services/   # API client
├── contracts/          # Soroban smart contracts (Rust)
│   ├── soroban/        # Main Bridge Watch contract
│   └── transfer_state_machine/
├── scripts/            # Setup and utility scripts
├── docs/               # Project documentation
├── docker-compose.yml      # Production compose
├── docker-compose.dev.yml  # Development compose
└── Makefile                # Common dev tasks
```

### Tech Stack

- **Backend:** Node.js 20, TypeScript, Fastify 4, Knex 3, PostgreSQL 15 (TimescaleDB), Redis 7, BullMQ
- **Frontend:** React 18, TypeScript, Vite 5, TailwindCSS 3, React Query, Recharts
- **Contracts:** Rust, Soroban SDK 21.x, WASM (wasm32-unknown-unknown)
- **Infrastructure:** Docker, Docker Compose, GitHub Actions CI/CD

### Service Ports (Development)

| Service         | URL                          | Credentials                      |
| --------------- | ---------------------------- | -------------------------------- |
| Frontend        | http://localhost:5173        | —                                |
| Backend API     | http://localhost:3001        | —                                |
| WebSocket       | ws://localhost:3002          | —                                |
| PostgreSQL      | localhost:5432               | bridge_watch / bridge_watch_dev  |
| Redis           | localhost:6379               | —                                |
| PgAdmin         | http://localhost:5050        | admin@bridgewatch.dev / admin    |
| Redis Commander | http://localhost:8081        | admin / admin                    |

---

## Running the Application

### Docker Dev Environment (Recommended)

```bash
# Start all services (frontend, backend, DB, Redis, PgAdmin, Redis Commander)
make dev

# Rebuild images and start
make dev-build

# Stop everything
make dev-down
```

### Native Development

```bash
# Ensure Docker services are running
docker compose -f docker-compose.dev.yml up -d postgres redis

# Start both workspaces
npm run dev

# Or start individually
npm run dev:backend
npm run dev:frontend
```

---

## Common Tasks

### Database

```bash
make migrate          # Run pending migrations
make seed             # Load seed data
make psql             # Open PostgreSQL shell
./scripts/setup.sh --reset-db -y   # Wipe and re-initialize DB
```

### Testing

```bash
npm test              # All workspaces
npm run test:backend  # Backend only

# Backend with coverage
cd backend && npm run test:coverage

# Contract tests
cd contracts && cargo test
```

### Linting

```bash
npm run lint          # All workspaces

# Auto-fix
cd backend && npm run lint:fix
cd contracts && cargo fmt
```

### Logs

```bash
make logs             # All services
make logs-backend     # Backend only
make logs-frontend    # Frontend only
```

### Shells

```bash
make shell-backend    # Shell into backend container
make shell-frontend   # Shell into frontend container
make redis-cli        # Redis CLI
```

---

## Troubleshooting

### Docker Issues

**"Cannot connect to the Docker daemon"**

Docker Desktop needs to be running. Start it from your application launcher, then retry.

**Port conflicts**

The setup script automatically detects if PostgreSQL (5432) or Redis (6379) ports are already in use by another process and will warn you before proceeding. If you see a port conflict:

```bash
# Check what's using a port
lsof -i :5432   # macOS/Linux
netstat -ano | findstr :5432  # Windows

# Option 1: Stop the conflicting service
brew services stop postgresql   # macOS example

# Option 2: Override ports in .env
POSTGRES_PORT=5555
REDIS_PORT=6380
PORT=3002
FRONTEND_PORT=5174
```

**"bridge-watch-postgres" container keeps restarting**

```bash
# Check logs
docker logs bridge-watch-postgres

# Most common fix: remove the volume and re-create
make clean
./scripts/setup.sh --reset-db -y
```

### Database Issues

**"role bridge_watch does not exist" or error code 28000**

A local PostgreSQL is intercepting connections on the same port as the Docker container. The setup script detects this automatically, but if you're running manually:

```bash
# Check for port conflicts
lsof -i :5432

# Use a different port for Docker
echo "POSTGRES_PORT=5555" >> .env
make clean
./scripts/setup.sh -y
```

**"relation does not exist"**

Migrations haven't been run:

```bash
npm run migrate --workspace=backend
```

**"database bridge_watch does not exist"**

The PostgreSQL container hasn't been initialized properly:

```bash
make clean
make dev-build
```

### Node.js Issues

**"engine node >=20 is incompatible"**

```bash
# Check your version
node -v

# Use nvm to switch
nvm install 20
nvm use 20
```

**npm install fails with permission errors**

```bash
# Don't use sudo with npm — fix permissions instead
# See: https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally
```

### Rust/Contract Issues

**"can't find crate for std" when building contracts**

```bash
rustup target add wasm32-unknown-unknown
```

**cargo build fails with network errors**

```bash
# Ensure you have network access and try again
cargo build 2>&1 | head -20
```

---

## Platform-Specific Notes

### macOS

- Docker Desktop is the recommended way to run Docker
- If using Apple Silicon (M1/M2/M3), all images used are multi-arch compatible
- Use Homebrew for installing Node.js and other tools

### Linux

- Add your user to the `docker` group to avoid `sudo`:
  ```bash
  sudo usermod -aG docker $USER
  # Log out and back in
  ```
- If using a distro without systemd, start Docker manually:
  ```bash
  sudo dockerd &
  ```

### Windows (WSL2)

- Use WSL2 with Ubuntu for the best experience
- Install Docker Desktop with the WSL2 backend
- Run all commands from inside the WSL2 terminal
- The repo should be cloned inside the WSL2 filesystem (e.g., `~/projects/Bridge-Watch`) for best performance — avoid `/mnt/c/`

### CI Environments

For headless CI use:

```bash
./scripts/setup.sh --no-color --yes --skip-ide --skip-contracts
```