# Monitoring Dashboard Templates

This repo includes **reusable Grafana dashboard templates** that can be imported into any Grafana instance connected to a Prometheus scraping Bridge Watch metrics.

Templates live in:

- `monitoring/grafana/dashboards/`

Example screenshots (SVG previews) live in:

- `monitoring/grafana/screenshots/`

## Included dashboards

- `bridgewatch-system-overview.json`
  - High-level health + saturation overview (availability, request rate, error %, latency, host signals, DB + queue rates).
- `bridgewatch-alert-volume.json`
  - Alert volume and firing breakdowns (Prometheus `ALERTS` + optional Alertmanager self-metrics).
- `bridgewatch-service-health.json`
  - Drill-down per service/job + route (traffic/errors/latency, plus DB/queue p95).
- `bridgewatch-historical-trends.json`
  - Longer-range trends for business metrics (bridge health, verifications, asset prices, liquidity TVL) + infra/app trends.

## Template goals / design

- **Reusable by default**
  - No hardcoded hostnames.
  - Filters are driven by Grafana variables.
- **Variable support**
  - Common variables: `datasource`, `job`, `instance`, `route`, `severity`, `service`, `team`, `bridge`, `asset`, `dex`.
- **Theme-aware layouts**
  - Panels rely on Grafana defaults for colors and styles.
  - Thresholds are configured but do not assume a light/dark theme.

## Metric mapping (Prometheus)

### Core service metrics (backend)

Bridge Watch backend exports Prometheus metrics on `GET /metrics`.

- `http_requests_total{method,route,status_code}`
  - Used for request rate, error rate.
- `http_request_duration_seconds_bucket{method,route,status_code,le}`
  - Used for p50/p95 latency.
- `http_active_connections`
- `db_queries_total{operation,table}`
- `db_query_errors_total{operation,table,error_type}`
- `db_query_duration_seconds_bucket{operation,table,le}`
- `queue_jobs_completed_total{queue_name,job_type}`
- `queue_jobs_failed_total{queue_name,job_type,error_type}`
- `queue_job_duration_seconds_bucket{queue_name,job_type,le}`

### Business metrics

- `bridge_health_score{bridge_id,bridge_name}`
- `bridge_verifications_total{bridge_id,bridge_name,asset}`
- `bridge_verification_success_total{bridge_id,bridge_name,asset}`
- `bridge_verification_failure_total{bridge_id,bridge_name,asset,reason}`
- `asset_price_usd{symbol,source}`
- `liquidity_tvl_usd{symbol,dex,chain}`
- `alerts_triggered_total{alert_type,priority,bridge_id}`
- `circuit_breaker_trips_total{bridge_id,reason}`

### Infra / uptime metrics

From exporters in `monitoring/` stack:

- `up{job,instance}`
- Node exporter
  - `node_cpu_seconds_total`
  - `node_memory_MemAvailable_bytes`
  - `node_memory_MemTotal_bytes`
- Blackbox exporter
  - `probe_success`

### Alerting / alert volume

Prometheus produces the built-in time series:

- `ALERTS{alertname,alertstate,severity,service,team,...}`

Optional (if you scrape Alertmanager itself):

- `alertmanager_notifications_total`
- `alertmanager_notifications_failed_total`

## Import instructions

### Option A: Provisioned automatically (recommended)

If you run the monitoring stack in `monitoring/docker-compose.yml`, Grafana provisions dashboards from:

- `monitoring/grafana/dashboards/` (mounted read-only)

To add/remove dashboards:

1. Put the dashboard JSON in `monitoring/grafana/dashboards/`
2. Restart Grafana container (or wait for Grafana to pick up changes depending on your environment)

### Option B: Manual import via Grafana UI

1. Open Grafana
2. Go to **Dashboards** -> **New** -> **Import**
3. Upload one of the JSON templates from `monitoring/grafana/dashboards/`
4. Select your Prometheus datasource

## Example screenshots

These are **static SVG previews** (not actual Grafana exports) meant to show intended layout:

- `monitoring/grafana/screenshots/bridgewatch-system-overview.svg`
- `monitoring/grafana/screenshots/bridgewatch-alert-volume.svg`
- `monitoring/grafana/screenshots/bridgewatch-service-health.svg`
- `monitoring/grafana/screenshots/bridgewatch-historical-trends.svg`

## Variable usage notes

- The templates use regex-friendly variable defaults (e.g. `allValue: ".*"`) so **All** works in PromQL `=~` matchers.
- If a variable is empty (e.g. `route` doesn’t exist yet because there is no traffic), Grafana will show “No data”.

## Compatibility notes

- Built and tested against Grafana schema version `39` (Grafana `11.x`).
- Prometheus queries assume the metric names from `backend/src/services/metrics.service.ts`.
