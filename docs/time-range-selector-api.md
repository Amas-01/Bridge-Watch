# Time Range Selector API

## Overview

The chart time range system supports preset and custom ranges, per-chart overrides, global application, URL persistence, and local preference persistence.

## Preset ranges

- `1H`
- `24H`
- `7D`
- `30D`
- `1Y`

## URL parameters

- `tr_apply_global` — `1` or `0`
- `tr_global` — serialized global selection
- `tr_chart_<chartId>` — serialized per-chart selection

Serialization format:

- Preset: `preset|24H`
- Custom: `custom|2026-04-01T00:00:00.000Z|2026-04-20T00:00:00.000Z`

## Local persistence

Stored in localStorage key:

- `bridgewatch.timeRanges.v1`

State persisted:

- `applyGlobally`
- `globalSelection`
- `chartSelections`
- `lastSelection`

## Core APIs

Utilities in `frontend/src/utils/timeRange.ts`:

- `TIME_RANGE_PRESETS`
- `filterSeriesByTimeRange()`
- `formatRangeLabel()`
- `serializeTimeRangeSelection()`
- `deserializeTimeRangeSelection()`

Provider in `frontend/src/hooks/useTimeRange.tsx`:

- `TimeRangeProvider`
- `useTimeRange()`

UI components in `frontend/src/components/TimeRangeSelector/`:

- `TimeRangeSelector`
- `DateRangePicker`

## Usage

```tsx
<TimeRangeSelector chartId="price-USDC" title="Price chart range" />
<PriceChart chartId="price-USDC" ... />
```

The selector and chart share `chartId`, allowing per-chart or global filtering.
