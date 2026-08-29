#!/usr/bin/env bash
# =============================================================================
# Bridge Watch — View Sandbox Logs
#
# Follows live logs from the Soroban sandbox container.
#
# Usage:
#   ./scripts/sandbox-logs.sh
#   or: npm run sandbox:logs
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.sandbox.yml"

cd "$PROJECT_ROOT"

docker compose -f docker-compose.sandbox.yml logs -f soroban-sandbox
