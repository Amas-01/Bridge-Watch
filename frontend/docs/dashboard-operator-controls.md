# Dashboard Operator Controls

## Entity switcher

The navigation bar includes a shared entity switcher for assets, bridges, and incident views. It supports text search, arrow-key navigation, Enter selection, Escape close, and recent selections persisted in local storage.

Recent selections are stored under `bridge-watch:entity-switcher-recents`.

## Inline status cards

The dashboard shows compact live status cards beneath the KPI banner:

- Service: bridge availability summary.
- Data freshness: asset health update recency.
- Asset health: critical asset health count.
- Reserve checks: bridge mismatch threshold status.

Each card exposes color-coded state and accessible text describing the current status.

## Metrics inspector

Each KPI card has an info action that opens a responsive drawer with:

- Metric definition.
- Source data.
- Current filter context.
- Refresh cadence.

The inspector uses the same filtered asset and bridge context as the KPI banner.
