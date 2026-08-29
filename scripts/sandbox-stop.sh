#!/usr/bin/env bash
# =============================================================================
# Bridge Watch — Stop Local Soroban Sandbox
#
# Stops the local Soroban sandbox container and optionally removes the
# generated .env.sandbox file.
#
# Usage:
#   ./scripts/sandbox-stop.sh
#   or: npm run sandbox:stop
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.env.sandbox"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.sandbox.yml"

# Colors
GREEN=$'\033[0;32m'
BLUE=$'\033[0;34m'
RESET=$'\033[0m'

info() { printf "${BLUE}ℹ${RESET}  %s\n" "$*"; }
success() { printf "${GREEN}✔${RESET}  %s\n" "$*"; }

cd "$PROJECT_ROOT"

info "Stopping Soroban sandbox container..."
docker compose -f docker-compose.sandbox.yml down

success "Soroban sandbox stopped"

# Remove .env.sandbox if it exists (as per resetOnStart: true in config)
if [[ -f "$ENV_FILE" ]]; then
  rm "$ENV_FILE"
  success "Removed $ENV_FILE"
fi

echo ""
info "To start again: npm run sandbox:start"
echo ""
