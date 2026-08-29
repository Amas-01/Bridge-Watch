#!/usr/bin/env bash
set -euo pipefail

ALERT_FILE="monitoring/prometheus-alerts.yml"

if [ ! -f "$ALERT_FILE" ]; then
  echo "Error: Prometheus alert rules file '$ALERT_FILE' not found."
  exit 1
fi

echo "Validating Prometheus alert rules in $ALERT_FILE..."

if command -v promtool &> /dev/null; then
  promtool check rules "$ALERT_FILE"
elif command -v docker &> /dev/null; then
  docker run --rm -v "$(pwd):/work" prom/prometheus:v2.54.1 check rules "/work/$ALERT_FILE"
else
  echo "Error: Neither 'promtool' nor 'docker' is available to validate Prometheus alert rules."
  exit 1
fi

echo "Prometheus alert rules validation passed successfully."
