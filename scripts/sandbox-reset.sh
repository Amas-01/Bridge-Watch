#!/usr/bin/env bash
# =============================================================================
# Bridge Watch — Reset Local Soroban Sandbox
#
# Stops the sandbox, removes volumes for a clean slate, then restarts.
#
# Usage:
#   ./scripts/sandbox-reset.sh
#   or: npm run sandbox:reset
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.sandbox.yml"

# Colors
GREEN=$'\033[0;32m'
BLUE=$'\033[0;34m'
YELLOW=$'\033[1;33m'
RESET=$'\033[0m'

info() { printf "${BLUE}ℹ${RESET}  %s\n" "$*"; }
success() { printf "${GREEN}✔${RESET}  %s\n" "$*"; }
warn() { printf "${YELLOW}⚠${RESET}  %s\n" "$*"; }

cd "$PROJECT_ROOT"

warn "Resetting sandbox to clean state (this will delete all sandbox data)"
info "Stopping container and removing volumes..."

docker compose -f docker-compose.sandbox.yml down -v

success "Sandbox reset complete"
echo ""
info "Starting fresh sandbox..."
echo ""

bash "$SCRIPT_DIR/sandbox-start.sh"
