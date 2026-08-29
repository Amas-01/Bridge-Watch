#!/usr/bin/env bash
# =============================================================================
# Bridge Watch — Development Environment Setup Script
#
# Automates local development environment configuration:
#   - Prerequisites checking
#   - Dependency installation (Node.js, Rust)
#   - Environment file setup (.env)
#   - Docker Compose services (PostgreSQL/TimescaleDB, Redis)
#   - Database initialization (migrations + seed data)
#   - Optional: Rust/Soroban contract build
#   - Optional: IDE configuration (.vscode)
#
# Usage:
#   ./scripts/setup.sh [OPTIONS]
#
# Options:
#   --skip-docker       Skip Docker services setup
#   --skip-db           Skip database migrations and seeding
#   --skip-contracts    Skip Rust/Soroban contract build
#   --skip-ide          Skip IDE configuration
#   --skip-deps         Skip npm dependency installation
#   --contracts-only    Only build contracts (skip everything else)
#   --docker-only       Only start Docker services
#   --reset-db          Tear down DB volume and re-initialize
#   --no-color          Disable colored output
#   --yes, -y           Skip all confirmation prompts
#   --help, -h          Show this help message
#
# Cross-platform: macOS, Linux, Windows (WSL / Git Bash / MSYS2)
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SKIP_DOCKER=false
SKIP_DB=false
SKIP_CONTRACTS=false
SKIP_IDE=false
SKIP_DEPS=false
CONTRACTS_ONLY=false
DOCKER_ONLY=false
RESET_DB=false
NO_COLOR=false
AUTO_YES=false

NODE_MIN_MAJOR=20
COMPOSE_CMD=""

# ---------------------------------------------------------------------------
# Colors and output helpers
# ---------------------------------------------------------------------------
RED="" GREEN="" YELLOW="" BLUE="" CYAN="" BOLD="" DIM="" RESET=""

setup_colors() {
  if [[ "$NO_COLOR" == true ]] || [[ ! -t 1 ]]; then
    RED="" GREEN="" YELLOW="" BLUE="" CYAN="" BOLD="" DIM="" RESET=""
  else
    RED=$'\033[0;31m'
    GREEN=$'\033[0;32m'
    YELLOW=$'\033[1;33m'
    BLUE=$'\033[0;34m'
    CYAN=$'\033[0;36m'
    BOLD=$'\033[1m'
    DIM=$'\033[2m'
    RESET=$'\033[0m'
  fi
}

info()    { printf "${BLUE}ℹ${RESET}  %s\n" "$*"; }
success() { printf "${GREEN}✔${RESET}  %s\n" "$*"; }
warn()    { printf "${YELLOW}⚠${RESET}  %s\n" "$*"; }
error()   { printf "${RED}✖${RESET}  %s\n" "$*" >&2; }
header()  { printf "\n${BOLD}${CYAN}▸ %s${RESET}\n" "$*"; }
dim()     { printf "${DIM}  %s${RESET}\n" "$*"; }

die() {
  error "$1"
  exit "${2:-1}"
}

confirm() {
  if [[ "$AUTO_YES" == true ]]; then return 0; fi
  local prompt="${1:-Continue?}"
  printf "${YELLOW}?${RESET}  %s [y/N] " "$prompt"
  read -r answer
  [[ "$answer" =~ ^[Yy]$ ]]
}

# ---------------------------------------------------------------------------
# OS detection
# ---------------------------------------------------------------------------
detect_os() {
  local uname_out
  uname_out="$(uname -s 2>/dev/null || echo "Unknown")"
  case "$uname_out" in
    Linux*)
      if grep -qi microsoft /proc/version 2>/dev/null; then
        OS="wsl"
      else
        OS="linux"
      fi
      ;;
    Darwin*)  OS="macos" ;;
    CYGWIN*|MINGW*|MSYS*) OS="windows" ;;
    *)        OS="unknown" ;;
  esac
  info "Detected OS: ${BOLD}$OS${RESET}"
}

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --skip-docker)    SKIP_DOCKER=true ;;
      --skip-db)        SKIP_DB=true ;;
      --skip-contracts) SKIP_CONTRACTS=true ;;
      --skip-ide)       SKIP_IDE=true ;;
      --skip-deps)      SKIP_DEPS=true ;;
      --contracts-only) CONTRACTS_ONLY=true ;;
      --docker-only)    DOCKER_ONLY=true ;;
      --reset-db)       RESET_DB=true ;;
      --no-color)       NO_COLOR=true ;;
      --yes|-y)         AUTO_YES=true ;;
      --help|-h)        show_help; exit 0 ;;
      *)                die "Unknown option: $1. Use --help for usage." ;;
    esac
    shift
  done
}

show_help() {
  cat <<'HELP'
Bridge Watch — Development Environment Setup

Usage: ./scripts/setup.sh [OPTIONS]

Options:
  --skip-docker       Skip Docker services startup
  --skip-db           Skip database migrations and seeding
  --skip-contracts    Skip Rust/Soroban contract build
  --skip-ide          Skip IDE configuration generation
  --skip-deps         Skip npm dependency installation
  --contracts-only    Only build Rust/Soroban contracts
  --docker-only       Only start Docker services (postgres + redis)
  --reset-db          Tear down DB volume and re-initialize from scratch
  --no-color          Disable colored output
  --yes, -y           Skip all confirmation prompts
  --help, -h          Show this help message

Examples:
  ./scripts/setup.sh                     # Full setup
  ./scripts/setup.sh -y                  # Full setup, no prompts
  ./scripts/setup.sh --skip-contracts    # Skip Rust build
  ./scripts/setup.sh --docker-only       # Only start Docker services
  ./scripts/setup.sh --reset-db -y       # Wipe and re-seed database
HELP
}

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
check_command() {
  command -v "$1" &>/dev/null
}

resolve_compose_cmd() {
  if docker compose version &>/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
  elif check_command docker-compose; then
    COMPOSE_CMD="docker-compose"
  else
    return 1
  fi
}

check_prerequisites() {
  header "Checking prerequisites"

  local missing=()

  # Git
  if check_command git; then
    success "git $(git --version | awk '{print $3}')"
  else
    missing+=("git")
    error "git is not installed"
  fi

  # Node.js
  if check_command node; then
    local node_version
    node_version="$(node -v | sed 's/^v//')"
    local node_major
    node_major="$(echo "$node_version" | cut -d. -f1)"
    if [[ "$node_major" -ge "$NODE_MIN_MAJOR" ]]; then
      success "node v${node_version} (>= ${NODE_MIN_MAJOR} required)"
    else
      error "node v${node_version} found, but >= v${NODE_MIN_MAJOR} is required"
      missing+=("node>=20")
    fi
  else
    missing+=("node")
    error "node is not installed"
  fi

  # npm
  if check_command npm; then
    success "npm $(npm -v)"
  else
    missing+=("npm")
    error "npm is not installed"
  fi

  # Docker
  if check_command docker; then
    if docker info &>/dev/null 2>&1; then
      success "docker $(docker --version | awk '{print $3}' | tr -d ',')"
    else
      warn "docker is installed but the daemon is not running"
      if [[ "$SKIP_DOCKER" == false && "$CONTRACTS_ONLY" == false ]]; then
        missing+=("docker-daemon")
      fi
    fi
  else
    if [[ "$SKIP_DOCKER" == false && "$CONTRACTS_ONLY" == false ]]; then
      missing+=("docker")
      error "docker is not installed"
    else
      warn "docker is not installed (skipped)"
    fi
  fi

  # Docker Compose
  if [[ "$SKIP_DOCKER" == false && "$CONTRACTS_ONLY" == false ]]; then
    if resolve_compose_cmd; then
      success "docker compose (${COMPOSE_CMD})"
    else
      missing+=("docker-compose")
      error "docker compose is not available"
    fi
  fi

  # Rust / Cargo (optional unless contracts-only)
  if [[ "$SKIP_CONTRACTS" == false ]]; then
    if check_command cargo; then
      success "cargo $(cargo --version | awk '{print $2}')"
      # Check for wasm target
      if rustup target list --installed 2>/dev/null | grep -q "wasm32-unknown-unknown"; then
        success "wasm32-unknown-unknown target installed"
      else
        warn "wasm32-unknown-unknown target not found — will attempt to install"
      fi
    else
      if [[ "$CONTRACTS_ONLY" == true ]]; then
        missing+=("cargo")
        error "cargo is not installed (required for --contracts-only)"
      else
        warn "cargo is not installed — contract build will be skipped"
        SKIP_CONTRACTS=true
      fi
    fi
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo ""
    error "Missing prerequisites: ${missing[*]}"
    echo ""
    print_install_hints "${missing[@]}"
    die "Please install the missing prerequisites and re-run this script."
  fi

  success "All prerequisites satisfied"
}

print_install_hints() {
  info "Installation hints:"
  for dep in "$@"; do
    case "$dep" in
      git)
        dim "  git     → https://git-scm.com/downloads"
        ;;
      node|node\>=20)
        dim "  node    → https://nodejs.org/ or use nvm: https://github.com/nvm-sh/nvm"
        case "$OS" in
          macos)  dim "           brew install node@20" ;;
          linux)  dim "           curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs" ;;
        esac
        ;;
      npm)
        dim "  npm     → comes with Node.js installation"
        ;;
      docker|docker-daemon)
        dim "  docker  → https://docs.docker.com/get-docker/"
        case "$OS" in
          macos)  dim "           brew install --cask docker" ;;
          linux)  dim "           https://docs.docker.com/engine/install/" ;;
          wsl)    dim "           Install Docker Desktop for Windows with WSL2 backend" ;;
        esac
        ;;
      docker-compose)
        dim "  compose → Included with Docker Desktop, or: https://docs.docker.com/compose/install/"
        ;;
      cargo)
        dim "  cargo   → curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Environment file
# ---------------------------------------------------------------------------
strip_wrapping_quotes() {
  local value="$1"

  if [[ "$value" =~ ^\".*\"$ ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

get_env_value() {
  local key="$1"
  local env_file="$PROJECT_ROOT/.env"

  [[ -f "$env_file" ]] || return 1

  awk -F= -v key="$key" '
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      sub(/^[[:space:]]*[^=]+=[[:space:]]*/, "", $0)
      gsub(/\r$/, "", $0)
      print $0
      exit
    }
  ' "$env_file"
}

set_env_default() {
  local key="$1"
  local fallback="$2"
  local current_value="${!key:-}"

  if [[ -n "$current_value" ]]; then
    return 0
  fi

  local file_value
  file_value="$(get_env_value "$key" || true)"
  file_value="$(strip_wrapping_quotes "$file_value")"

  if [[ -z "$file_value" ]]; then
    file_value="$fallback"
  fi

  export "$key=$file_value"
}

load_runtime_env_defaults() {
  set_env_default "POSTGRES_PORT" "5432"
  set_env_default "POSTGRES_USER" "bridge_watch"
  set_env_default "POSTGRES_DB" "bridge_watch"
  set_env_default "REDIS_PORT" "6379"
  set_env_default "PORT" "3001"
  set_env_default "WS_PORT" "3002"
  set_env_default "FRONTEND_PORT" "5173"
  set_env_default "PGADMIN_PORT" "5050"
  set_env_default "REDIS_COMMANDER_PORT" "8081"
}

setup_env_file() {
  header "Setting up environment file"

  local env_file="$PROJECT_ROOT/.env"
  local env_example="$PROJECT_ROOT/.env.example"

  if [[ -f "$env_file" ]]; then
    success ".env already exists"
    dim "To reset, delete .env and re-run this script"
  elif [[ -f "$env_example" ]]; then
    cp "$env_example" "$env_file"
    success "Created .env from .env.example"
    warn "Review .env and add any API keys (Circle, Coinbase, Infura, etc.)"
  else
    die ".env.example not found at project root"
  fi

  # Avoid sourcing .env directly because unquoted values (e.g. SMTP_FROM_NAME)
  # can break shell parsing; load only required keys safely.
  load_runtime_env_defaults
}

# ---------------------------------------------------------------------------
# npm dependencies
# ---------------------------------------------------------------------------
install_deps() {
  if [[ "$SKIP_DEPS" == true ]]; then
    dim "Skipping npm dependency installation (--skip-deps)"
    return 0
  fi

  header "Installing npm dependencies"

  cd "$PROJECT_ROOT"

  if [[ -d "node_modules" && -d "backend/node_modules" && -d "frontend/node_modules" ]]; then
    info "node_modules directories exist — running npm install to sync..."
  fi

  npm install

  success "npm dependencies installed (root + backend + frontend workspaces)"
}

# ---------------------------------------------------------------------------
# Port conflict detection
# ---------------------------------------------------------------------------
check_port_conflicts() {
  local pg_port="${POSTGRES_PORT:-5432}"
  local redis_port="${REDIS_PORT:-6379}"
  local conflicts=false

  for port_info in "PostgreSQL:${pg_port}" "Redis:${redis_port}"; do
    local name="${port_info%%:*}"
    local port="${port_info##*:}"

    local pid_on_port=""
    if [[ "$OS" == "macos" || "$OS" == "linux" || "$OS" == "wsl" ]]; then
      pid_on_port="$(lsof -ti :"$port" 2>/dev/null | head -1)" || true
    fi

    if [[ -n "$pid_on_port" ]]; then
      local proc_name
      proc_name="$(ps -p "$pid_on_port" -o comm= 2>/dev/null)" || proc_name="unknown"
      # Ignore if it's Docker itself
      if [[ "$proc_name" == *docker* || "$proc_name" == *com.docke* ]]; then
        continue
      fi
      warn "Port ${port} (${name}) is already in use by '${proc_name}' (PID ${pid_on_port})"
      conflicts=true
    fi
  done

  if [[ "$conflicts" == true ]]; then
    echo ""
    error "Port conflict detected. The Docker containers will not be reachable on localhost."
    info "Options:"
    dim "  1. Stop the conflicting service(s) and re-run this script"
    dim "  2. Change the port(s) in .env (e.g. POSTGRES_PORT=5433)"
    echo ""
    if ! confirm "Continue anyway?"; then
      die "Aborted due to port conflicts."
    fi
  fi
}

# ---------------------------------------------------------------------------
# Docker services
# ---------------------------------------------------------------------------
start_docker_services() {
  if [[ "$SKIP_DOCKER" == true ]]; then
    dim "Skipping Docker services (--skip-docker)"
    return 0
  fi

  header "Starting Docker services"

  cd "$PROJECT_ROOT"

  resolve_compose_cmd || die "docker compose not available"

  if [[ "$RESET_DB" == true ]]; then
    warn "Tearing down existing Docker volumes (--reset-db)"
    $COMPOSE_CMD -f docker-compose.dev.yml down -v --remove-orphans 2>/dev/null || true
  fi

  check_port_conflicts

  info "Starting PostgreSQL (TimescaleDB) and Redis..."
  $COMPOSE_CMD -f docker-compose.dev.yml up -d postgres redis

  wait_for_service "postgres" 60
  wait_for_service "redis" 30

  success "Docker services are running"
  dim "PostgreSQL: localhost:${POSTGRES_PORT:-5432}"
  dim "Redis:      localhost:${REDIS_PORT:-6379}"
}

wait_for_service() {
  local service="$1"
  local timeout="${2:-60}"
  local elapsed=0

  info "Waiting for ${service} to be healthy (timeout: ${timeout}s)..."

  while [[ $elapsed -lt $timeout ]]; do
    # Try JSON format (works across Docker Compose v2 versions)
    local health
    health="$($COMPOSE_CMD -f docker-compose.dev.yml ps "$service" --format json 2>/dev/null \
      | grep -o '"Health":"[^"]*"' | head -1 | cut -d'"' -f4)" || true
    if [[ "$health" == "healthy" ]]; then
      success "${service} is healthy"
      return 0
    fi

    # Fallback: direct container check
    if [[ "$service" == "postgres" ]]; then
      if docker exec bridge-watch-postgres pg_isready -U "${POSTGRES_USER:-bridge_watch}" &>/dev/null; then
        # pg_isready succeeds before init scripts finish — verify with an actual query
        if docker exec bridge-watch-postgres psql -U "${POSTGRES_USER:-bridge_watch}" -d "${POSTGRES_DB:-bridge_watch}" -c "SELECT 1" &>/dev/null; then
          success "${service} is healthy (verified via query)"
          return 0
        fi
      fi
    elif [[ "$service" == "redis" ]]; then
      if docker exec bridge-watch-redis redis-cli ping 2>/dev/null | grep -q PONG; then
        success "${service} is healthy (verified via ping)"
        return 0
      fi
    fi

    sleep 3
    elapsed=$((elapsed + 3))
  done

  die "${service} did not become healthy within ${timeout}s. Check: docker logs bridge-watch-${service}"
}

# ---------------------------------------------------------------------------
# Retry helper
# ---------------------------------------------------------------------------
run_with_retry() {
  local max_attempts="$1"
  shift
  local attempt=1
  while [[ $attempt -le $max_attempts ]]; do
    if "$@"; then
      return 0
    fi
    if [[ $attempt -lt $max_attempts ]]; then
      warn "Command failed (attempt ${attempt}/${max_attempts}), retrying in 5s..."
      sleep 5
    fi
    attempt=$((attempt + 1))
  done
  die "Command failed after ${max_attempts} attempts: $*"
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
setup_database() {
  if [[ "$SKIP_DB" == true ]]; then
    dim "Skipping database setup (--skip-db)"
    return 0
  fi

  if [[ "$SKIP_DOCKER" == true ]]; then
    warn "Docker was skipped — database setup requires a running PostgreSQL instance"
    if ! confirm "Continue with database setup anyway?"; then
      dim "Skipping database setup"
      return 0
    fi
  fi

  header "Setting up database"

  cd "$PROJECT_ROOT"

  info "Running database migrations..."
  run_with_retry 3 npm run migrate --workspace=backend
  success "Migrations complete"

  info "Loading seed data..."
  run_with_retry 3 npm run seed --workspace=backend
  success "Seed data loaded"
}

# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------
setup_contracts() {
  if [[ "$SKIP_CONTRACTS" == true ]]; then
    dim "Skipping contract build (--skip-contracts)"
    return 0
  fi

  header "Building Rust/Soroban contracts"

  cd "$PROJECT_ROOT/contracts"

  # Ensure wasm target is installed
  if ! rustup target list --installed 2>/dev/null | grep -q "wasm32-unknown-unknown"; then
    info "Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
    success "wasm32-unknown-unknown target installed"
  fi

  info "Running cargo build..."
  cargo build
  success "Contracts built successfully"

  info "Running cargo test..."
  cargo test
  success "Contract tests passed"
}

# ---------------------------------------------------------------------------
# IDE configuration
# ---------------------------------------------------------------------------
setup_ide() {
  if [[ "$SKIP_IDE" == true ]]; then
    dim "Skipping IDE configuration (--skip-ide)"
    return 0
  fi

  header "Setting up IDE configuration"

  local vscode_dir="$PROJECT_ROOT/.vscode"
  if ! mkdir -p "$vscode_dir" 2>/dev/null; then
    warn "Could not create .vscode directory — skipping IDE configuration"
    return 0
  fi

  # settings.json
  if [[ ! -f "$vscode_dir/settings.json" ]]; then
    cat > "$vscode_dir/settings.json" << 'EOF'
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.tsdk": "node_modules/typescript/lib",
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[rust]": {
    "editor.defaultFormatter": "rust-lang.rust-analyzer",
    "editor.formatOnSave": true
  },
  "rust-analyzer.check.command": "clippy",
  "rust-analyzer.cargo.features": "all",
  "files.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "**/build": true,
    "contracts/target": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/dist": true,
    "contracts/target": true,
    "package-lock.json": true,
    "contracts/Cargo.lock": true
  },
  "tailwindCSS.experimental.classRegex": [
    ["clsx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
  ]
}
EOF
    success "Created .vscode/settings.json"
  else
    dim ".vscode/settings.json already exists — skipping"
  fi

  # extensions.json
  if [[ ! -f "$vscode_dir/extensions.json" ]]; then
    cat > "$vscode_dir/extensions.json" << 'EOF'
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "rust-lang.rust-analyzer",
    "ms-azuretools.vscode-docker",
    "mikestead.dotenv",
    "formulahendry.auto-rename-tag",
    "usernamehw.errorlens",
    "eamodio.gitlens"
  ]
}
EOF
    success "Created .vscode/extensions.json"
  else
    dim ".vscode/extensions.json already exists — skipping"
  fi
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
print_summary() {
  echo ""
  printf "${BOLD}${GREEN}%s${RESET}\n" "════════════════════════════════════════════════════════"
  printf "${BOLD}${GREEN}  ✔  Bridge Watch — Setup Complete${RESET}\n"
  printf "${BOLD}${GREEN}%s${RESET}\n" "════════════════════════════════════════════════════════"
  echo ""
  info "Next steps:"
  echo ""

  if [[ "$SKIP_DOCKER" == false ]]; then
    dim "  Start the full dev environment:"
    dim "    make dev                  # or: docker compose -f docker-compose.dev.yml up"
    echo ""
    dim "  Or run frontend/backend natively:"
    dim "    npm run dev               # starts both workspaces"
    dim "    npm run dev:backend       # backend only (requires Docker DB + Redis)"
    dim "    npm run dev:frontend      # frontend only"
  else
    dim "  Start the development servers:"
    dim "    npm run dev               # starts backend + frontend"
  fi

  echo ""
  dim "  Run tests:"
  dim "    npm test                  # all workspaces"
  dim "    npm run test:backend      # backend only"
  if [[ "$SKIP_CONTRACTS" == false ]]; then
    dim "    cd contracts && cargo test  # Soroban contracts"
  fi

  echo ""
  dim "  Useful make targets:"
  dim "    make help                 # list all targets"
  dim "    make migrate              # run DB migrations"
  dim "    make seed                 # seed database"
  dim "    make psql                 # open PostgreSQL shell"
  dim "    make logs                 # follow all service logs"

  echo ""
  dim "  Dev services:"
  dim "    Frontend   http://localhost:${FRONTEND_PORT:-5173}"
  dim "    Backend    http://localhost:${PORT:-3001}"
  dim "    WebSocket  ws://localhost:${WS_PORT:-3002}"
  dim "    PgAdmin    http://localhost:${PGADMIN_PORT:-5050}  (admin@bridgewatch.dev / admin)"
  dim "    Redis UI   http://localhost:${REDIS_COMMANDER_PORT:-8081}  (admin / admin)"

  echo ""
  dim "  Documentation:"
  dim "    docs/DEVELOPMENT_SETUP.md  — detailed setup guide"
  dim "    CONTRIBUTING.md            — contribution guidelines"
  echo ""
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  parse_args "$@"
  setup_colors

  echo ""
  printf "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}\n"
  printf "${BOLD}${CYAN}║     Bridge Watch — Development Environment Setup    ║${RESET}\n"
  printf "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}\n"
  echo ""

  detect_os

  # Handle subset modes
  if [[ "$CONTRACTS_ONLY" == true ]]; then
    check_prerequisites
    setup_contracts
    success "Contracts-only setup complete."
    return 0
  fi

  if [[ "$DOCKER_ONLY" == true ]]; then
    check_prerequisites
    setup_env_file
    start_docker_services
    success "Docker-only setup complete."
    return 0
  fi

  # Full setup
  check_prerequisites
  setup_env_file
  install_deps
  start_docker_services
  setup_database
  setup_contracts
  setup_ide
  print_summary
}

main "$@"
