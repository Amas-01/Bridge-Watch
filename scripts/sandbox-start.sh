#!/usr/bin/env bash
# =============================================================================
# Bridge Watch — Local Soroban Sandbox Startup Script
#
# Spins up a local Soroban network via Docker, compiles and deploys Rust
# contracts, and seeds local state with mock operator profiles and test assets.
#
# Usage:
#   ./scripts/sandbox-start.sh
#   or: npm run sandbox:start
#
# Prerequisites:
#   - Docker (running)
#   - soroban-cli
#   - Rust toolchain with wasm32-unknown-unknown target
#
# Output:
#   - .env.sandbox file with deployed contract addresses and test account keys
#   - Running Docker container: bridge-watch-soroban-sandbox
#
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Globals
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG_FILE="$PROJECT_ROOT/contracts/soroban/sandbox.config.json"
ENV_FILE="$PROJECT_ROOT/.env.sandbox"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.sandbox.yml"

CONTAINER_STARTUP_TIMEOUT=60
NO_COLOR=false

# ---------------------------------------------------------------------------
# Colors and output helpers
# ---------------------------------------------------------------------------
RED="" GREEN="" YELLOW="" BLUE="" CYAN="" BOLD="" DIM="" RESET=""

setup_colors() {
  if [[ "$NO_COLOR" == true ]] || [[ ! -t 1 ]]; then
    return
  fi
  RED=$'\033[0;31m'
  GREEN=$'\033[0;32m'
  YELLOW=$'\033[1;33m'
  BLUE=$'\033[0;34m'
  CYAN=$'\033[0;36m'
  BOLD=$'\033[1m'
  DIM=$'\033[2m'
  RESET=$'\033[0m'
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

# ---------------------------------------------------------------------------
# Step 1 — Prerequisite Check
# ---------------------------------------------------------------------------
check_prerequisites() {
  header "Step 1 — Checking prerequisites"

  local missing=()

  # Docker
  if ! command -v docker &>/dev/null; then
    missing+=("docker")
    error "docker is not installed"
  elif ! docker info &>/dev/null 2>&1; then
    missing+=("docker-daemon")
    error "docker daemon is not running"
  else
    success "docker $(docker --version | awk '{print $3}' | tr -d ',')"
  fi

  # Docker Compose
  if docker compose version &>/dev/null 2>&1; then
    success "docker compose"
  elif command -v docker-compose &>/dev/null; then
    success "docker-compose"
  else
    missing+=("docker-compose")
    error "docker compose is not available"
  fi

  # soroban-cli
  if command -v soroban &>/dev/null; then
    local soroban_version
    soroban_version="$(soroban --version 2>/dev/null | awk '{print $2}')"
    success "soroban-cli ${soroban_version}"
  else
    missing+=("soroban-cli")
    error "soroban-cli is not installed"
  fi

  # Rust / Cargo
  if command -v cargo &>/dev/null; then
    success "cargo $(cargo --version | awk '{print $2}')"
  else
    missing+=("cargo")
    error "cargo is not installed"
  fi

  # wasm32-unknown-unknown target
  if command -v rustup &>/dev/null; then
    if rustup target list --installed 2>/dev/null | grep -q "wasm32-unknown-unknown"; then
      success "wasm32-unknown-unknown target installed"
    else
      missing+=("wasm32-unknown-unknown")
      error "wasm32-unknown-unknown target not installed"
    fi
  fi

  # Configuration file
  if [[ ! -f "$CONFIG_FILE" ]]; then
    missing+=("sandbox.config.json")
    error "Configuration file not found: $CONFIG_FILE"
  else
    success "sandbox.config.json found"
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
      docker|docker-daemon)
        dim "  docker     → https://docs.docker.com/get-docker/"
        ;;
      docker-compose)
        dim "  compose    → Included with Docker Desktop, or: https://docs.docker.com/compose/install/"
        ;;
      soroban-cli)
        dim "  soroban    → cargo install --locked soroban-cli"
        dim "               https://soroban.stellar.org/docs/getting-started/setup"
        ;;
      cargo)
        dim "  cargo      → curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
        ;;
      wasm32-unknown-unknown)
        dim "  wasm target → rustup target add wasm32-unknown-unknown"
        ;;
    esac
  done
}

# ---------------------------------------------------------------------------
# Step 2 — Start Local Soroban Network Container
# ---------------------------------------------------------------------------
start_soroban_network() {
  header "Step 2 — Starting local Soroban network container"

  cd "$PROJECT_ROOT"

  # Check if container is already running
  if docker ps --format '{{.Names}}' | grep -q "^bridge-watch-soroban-sandbox$"; then
    warn "Soroban sandbox container is already running"
    info "To restart with a clean state, run: npm run sandbox:reset"
    return 0
  fi

  info "Starting stellar/quickstart:soroban-dev container..."
  docker compose -f docker-compose.sandbox.yml up -d soroban-sandbox

  info "Waiting for container health check (timeout: ${CONTAINER_STARTUP_TIMEOUT}s)..."
  local elapsed=0
  while [[ $elapsed -lt $CONTAINER_STARTUP_TIMEOUT ]]; do
    if docker inspect bridge-watch-soroban-sandbox --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy"; then
      success "Soroban sandbox is healthy"
      return 0
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done

  error "Soroban sandbox did not become healthy within ${CONTAINER_STARTUP_TIMEOUT}s"
  error "Check logs: docker logs bridge-watch-soroban-sandbox"
  die "Container startup failed"
}

# ---------------------------------------------------------------------------
# Step 3 — Compile All Contracts
# ---------------------------------------------------------------------------
compile_contracts() {
  header "Step 3 — Compiling all contracts"

  cd "$PROJECT_ROOT/contracts"

  # Ensure wasm target is available
  if ! rustup target list --installed 2>/dev/null | grep -q "wasm32-unknown-unknown"; then
    info "Installing wasm32-unknown-unknown target..."
    rustup target add wasm32-unknown-unknown
  fi

  info "Running: cargo build --workspace --target wasm32-unknown-unknown --release"
  if ! cargo build --workspace --target wasm32-unknown-unknown --release; then
    die "Contract compilation failed"
  fi

  # Verify WASM outputs exist
  local wasm_dir="$PROJECT_ROOT/contracts/target/wasm32-unknown-unknown/release"
  local expected_wasms=("bridge_watch_contracts.wasm" "transfer_state_machine.wasm")

  for wasm in "${expected_wasms[@]}"; do
    if [[ -f "$wasm_dir/$wasm" ]]; then
      success "Compiled: $wasm"
    else
      die "Expected WASM file not found: $wasm_dir/$wasm"
    fi
  done

  success "All contracts compiled successfully"
}

# ---------------------------------------------------------------------------
# Step 4 — Deploy All Contracts
# ---------------------------------------------------------------------------
deploy_contracts() {
  header "Step 4 — Deploying all contracts"

  # Initialize .env.sandbox
  cat > "$ENV_FILE" << 'EOF'
# =============================================================================
# Bridge Watch — Local Sandbox Environment Variables
# Generated by scripts/sandbox-start.sh
#
# This file contains deployed contract addresses and test account keypairs
# for the local Soroban sandbox network.
#
# DO NOT COMMIT THIS FILE — it is gitignored.
# =============================================================================

# Network Configuration
SANDBOX_NETWORK_PASSPHRASE="Standalone Network ; February 2017"
SANDBOX_RPC_URL="http://127.0.0.1:8000/soroban/rpc"
SANDBOX_HORIZON_URL="http://127.0.0.1:8000"

# Deployed Contract Addresses
EOF

  local wasm_dir="$PROJECT_ROOT/contracts/target/wasm32-unknown-unknown/release"

  # Deploy bridge-watch-contracts
  info "Deploying bridge-watch-contracts..."
  local bridge_watch_id
  bridge_watch_id=$(soroban contract deploy \
    --wasm "$wasm_dir/bridge_watch_contracts.wasm" \
    --source-account admin \
    --rpc-url http://127.0.0.1:8000/soroban/rpc \
    --network-passphrase "Standalone Network ; February 2017" 2>&1 | tail -1)

  if [[ -z "$bridge_watch_id" ]]; then
    die "Failed to deploy bridge-watch-contracts"
  fi
  success "Deployed bridge-watch-contracts: $bridge_watch_id"
  echo "SANDBOX_BRIDGE_WATCH_CONTRACT_ID=\"$bridge_watch_id\"" >> "$ENV_FILE"

  # Deploy transfer-state-machine
  info "Deploying transfer-state-machine..."
  local transfer_machine_id
  transfer_machine_id=$(soroban contract deploy \
    --wasm "$wasm_dir/transfer_state_machine.wasm" \
    --source-account admin \
    --rpc-url http://127.0.0.1:8000/soroban/rpc \
    --network-passphrase "Standalone Network ; February 2017" 2>&1 | tail -1)

  if [[ -z "$transfer_machine_id" ]]; then
    die "Failed to deploy transfer-state-machine"
  fi
  success "Deployed transfer-state-machine: $transfer_machine_id"
  echo "SANDBOX_TRANSFER_STATE_MACHINE_CONTRACT_ID=\"$transfer_machine_id\"" >> "$ENV_FILE"

  echo "" >> "$ENV_FILE"
  echo "# Test Account Public Keys" >> "$ENV_FILE"

  success "All contracts deployed"
}

# ---------------------------------------------------------------------------
# Step 5 — Seed Mock Accounts
# ---------------------------------------------------------------------------
seed_accounts() {
  header "Step 5 — Seeding mock accounts"

  local accounts=("admin" "operator" "test_user" "treasury")

  for account in "${accounts[@]}"; do
    info "Generating keypair for: $account"

    # Generate identity (soroban-cli manages keys locally)
    if soroban keys generate "$account" --network standalone 2>/dev/null; then
      success "Generated keypair: $account"
    else
      # Key may already exist
      warn "Keypair $account already exists — reusing"
    fi

    # Get public key
    local pubkey
    pubkey=$(soroban keys address "$account")

    # Fund via friendbot
    info "Funding $account via friendbot..."
    if curl -s -X POST "http://127.0.0.1:8000/friendbot?addr=$pubkey" >/dev/null 2>&1; then
      success "Funded: $account ($pubkey)"
    else
      warn "Friendbot funding may have failed for $account — continuing"
    fi

    # Write to .env.sandbox (public keys only — private keys are in soroban-cli keystore)
    echo "SANDBOX_${account^^}_PUBLIC_KEY=\"$pubkey\"" >> "$ENV_FILE"
  done

  success "All accounts seeded"
}

# ---------------------------------------------------------------------------
# Step 6 — Seed Contract State
# ---------------------------------------------------------------------------
seed_contract_state() {
  header "Step 6 — Seeding contract state"

  # Source the generated .env.sandbox to get contract IDs
  # shellcheck disable=SC1090
  source "$ENV_FILE"

  local bridge_contract_id="${SANDBOX_BRIDGE_WATCH_CONTRACT_ID}"
  local admin_key="${SANDBOX_ADMIN_PUBLIC_KEY}"

  if [[ -z "$bridge_contract_id" || -z "$admin_key" ]]; then
    die "Contract ID or admin key not found in $ENV_FILE"
  fi

  # Initialize the contract with admin address
  info "Initializing bridge-watch contract with admin..."
  if soroban contract invoke \
    --id "$bridge_contract_id" \
    --source-account admin \
    --rpc-url http://127.0.0.1:8000/soroban/rpc \
    --network-passphrase "Standalone Network ; February 2017" \
    -- \
    initialize \
    --admin "$admin_key" 2>/dev/null; then
    success "Contract initialized with admin"
  else
    warn "Contract initialization may have failed — continuing"
  fi

  # Register test assets
  info "Registering test assets (USDC, EURC, PYUSD)..."
  for asset in "USDC" "EURC" "PYUSD"; do
    if soroban contract invoke \
      --id "$bridge_contract_id" \
      --source-account admin \
      --rpc-url http://127.0.0.1:8000/soroban/rpc \
      --network-passphrase "Standalone Network ; February 2017" \
      -- \
      register_asset \
      --caller "$admin_key" \
      --asset_code "$asset" 2>/dev/null; then
      success "Registered asset: $asset"
    else
      warn "Asset registration may have failed for $asset — continuing"
    fi
  done

  success "Contract state seeded"
}

# ---------------------------------------------------------------------------
# Step 7 — Print Success Summary
# ---------------------------------------------------------------------------
print_summary() {
  echo ""
  printf "${BOLD}${GREEN}%s${RESET}\n" "════════════════════════════════════════════════════════"
  printf "${BOLD}${GREEN}  ✔  Local Soroban Sandbox Ready${RESET}\n"
  printf "${BOLD}${GREEN}%s${RESET}\n" "════════════════════════════════════════════════════════"
  echo ""

  info "Network Endpoints:"
  dim "  RPC:     http://127.0.0.1:8000/soroban/rpc"
  dim "  Horizon: http://127.0.0.1:8000"
  echo ""

  info "Deployed Contracts:"
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  dim "  bridge-watch-contracts:   ${SANDBOX_BRIDGE_WATCH_CONTRACT_ID}"
  dim "  transfer-state-machine:   ${SANDBOX_TRANSFER_STATE_MACHINE_CONTRACT_ID}"
  echo ""

  info "Test Accounts (Public Keys):"
  dim "  admin:     ${SANDBOX_ADMIN_PUBLIC_KEY}"
  dim "  operator:  ${SANDBOX_OPERATOR_PUBLIC_KEY}"
  dim "  test_user: ${SANDBOX_TEST_USER_PUBLIC_KEY}"
  dim "  treasury:  ${SANDBOX_TREASURY_PUBLIC_KEY}"
  echo ""

  info "Environment File:"
  dim "  $ENV_FILE"
  echo ""

  info "Useful Commands:"
  dim "  npm run sandbox:stop    # Stop the sandbox"
  dim "  npm run sandbox:reset   # Reset to clean state"
  dim "  npm run sandbox:logs    # View container logs"
  echo ""

  dim "Private keys are managed by soroban-cli in:"
  dim "  ~/.config/soroban/identity/"
  echo ""
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  setup_colors

  echo ""
  printf "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}\n"
  printf "${BOLD}${CYAN}║     Bridge Watch — Local Soroban Sandbox Startup    ║${RESET}\n"
  printf "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}\n"
  echo ""

  check_prerequisites
  start_soroban_network
  compile_contracts
  deploy_contracts
  seed_accounts
  seed_contract_state
  print_summary
}

main "$@"
