# Risk Score Calculation

The Soroban contract now exposes deterministic risk score helpers that combine health, price deviation, and volatility into a normalized output.

## Contract API

- `set_risk_score_config`
- `get_risk_score_config`
- `calculate_risk_score`
- `get_asset_risk_score`

## Methodology

- Output is normalized to basis points from `0` to `10_000`.
- Health is inverted into a risk signal:
  - `normalized_health_risk_bps = (100 - health_score) * 100`
- Price deviation and volatility are normalized against configurable ceilings:
  - `max_price_deviation_bps`
  - `max_volatility_bps`
- Raw price and volatility inputs are clamped to their configured ceilings before weighting.
- The weighted result is deterministic and clamped to `10_000`.

## Default Configuration

- `health_weight_bps = 5000`
- `price_weight_bps = 2500`
- `volatility_weight_bps = 2500`
- `max_price_deviation_bps = 2000`
- `max_volatility_bps = 5000`

## Read-Only Asset Query

`get_asset_risk_score` derives inputs from existing on-chain state:

- current asset health score
- recent price history for the requested statistical period
- computed volatility over that same period

It does not write any state and emits no calculation event.

## Operational Notes

- Config writes emit a `risk_cfg` event for auditability.
- Config changes are stored in instance storage and included in checkpoints.
- Tests cover defaults, custom config, input clamping, and asset-derived read-only scoring.
