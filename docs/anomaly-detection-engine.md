# Real-Time Anomaly Detection Engine

The anomaly detection engine correlates price, liquidity, supply, bridge-health, and composite health-score signals before surfacing an operator-facing event. It runs from the backend worker queue every minute and can also be invoked manually through the API.

## Detection Inputs

- Price data comes from the aggregated price service and includes VWAP plus source deviation.
- Liquidity data comes from aggregated orderbook and AMM depth.
- Supply and bridge-health data comes from bridge status records, including supply mismatch and bridge state.
- Health-score data comes from the composite health service.

## Correlation Rules

An event is emitted only when the number of matched signals is at least the configured `min_signal_count`. This avoids alerting on a single noisy datapoint unless an operator explicitly lowers the threshold.

Default thresholds are seeded in `anomaly_thresholds`:

| Setting | Default | Meaning |
| --- | ---: | --- |
| `price_change_pct` | 5 | Price move or source-price divergence required to count as a price signal. |
| `liquidity_change_pct` | 25 | Liquidity movement required to count as a liquidity signal. |
| `supply_mismatch_pct` | 1 | Bridge supply mismatch required to count as a supply divergence signal. |
| `health_score_drop` | 10 | Composite health score drop required to count as a health signal. |
| `min_signal_count` | 2 | Minimum correlated signals required before alerting. |
| `duplicate_window_seconds` | 900 | Time window used to suppress repeated detections with the same fingerprint. |

Thresholds can be global (`asset_code = '*'`, `bridge_name = '*'`), per asset, per bridge, or per asset and bridge. Resolution prefers the most specific active row first.

## Duplicate Suppression

Each event is fingerprinted from asset, bridge, signal type, signal direction, and metric. If the same fingerprint appears inside the configured duplicate window, the new event is persisted with `is_suppressed = true` and linked through `suppressed_by_event_id`. Suppressed events are excluded from recent event queries unless requested.

## Explainability

Each persisted event includes:

- `signals`: the exact matched signal set with current value, previous value when available, threshold, direction, and delta.
- `explanation`: a summary, the active rule thresholds, and the evidence used to produce the event.
- `metadata`: source timestamps and threshold id for operator auditability.

## API

- `GET /api/v1/anomaly-detection/events` lists recent detections. Query filters: `assetCode`, `bridgeName`, `severity`, `includeSuppressed`, and `limit`.
- `POST /api/v1/anomaly-detection/evaluate` runs detection for one asset and optional bridge.
- `GET /api/v1/anomaly-detection/thresholds` lists configured thresholds.
- `PUT /api/v1/anomaly-detection/thresholds` creates or updates a threshold row for an asset and bridge scope.

## Tuning Guidance

- Increase `min_signal_count` to reduce noise during volatile markets.
- Lower `price_change_pct` for stablecoins or pegged assets where small price movement matters.
- Lower `liquidity_change_pct` for thin markets where depth changes are operationally important.
- Lower `duplicate_window_seconds` when operators need repeated reminders for persistent instability.
