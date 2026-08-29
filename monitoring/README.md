# Bridge Watch Monitoring Stack

This folder provides a full observability stack for Bridge Watch:

- Metrics: Prometheus
- Dashboards: Grafana
- Alerting and routing: Alertmanager
- Log aggregation: Loki + Promtail
- Tracing backend: Tempo (OTLP receiver enabled)
- Uptime checks: Blackbox Exporter
- Host resource monitoring: Node Exporter

## Start stack

```bash
cd monitoring
docker compose up -d
```

## Endpoints

- Grafana: `http://localhost:3000` (admin/admin)
- Prometheus: `http://localhost:9090`
- Alertmanager: `http://localhost:9093`
- Loki: `http://localhost:3100`
- Tempo: `http://localhost:3200`

## Trace integration

The Tempo service listens for OTLP on:

- gRPC: `localhost:4317`
- HTTP: `localhost:4318`

Point the backend OpenTelemetry exporter to one of these endpoints.

## Alert routing

Alertmanager routes:

- `critical` alerts to PagerDuty and Slack
- `team=bridge` alerts to bridge channel
- `team=api` alerts to API channel

Replace placeholder integration keys/webhooks in `alertmanager.yml` before production use.

## Dashboard templates

Reusable Grafana dashboard templates are available in:

- `monitoring/grafana/dashboards/`

See:

- `monitoring/DASHBOARD_TEMPLATES.md` for import and provisioning instructions.

## Runbooks

Alert annotations include `runbook_url` values pointing to:

- `monitoring/runbooks/critical-alerts.md`
