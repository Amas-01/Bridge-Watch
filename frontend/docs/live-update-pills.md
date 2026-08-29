# Live Update Pills

Small pills that show how recently a view's data updated, whether it is stale,
and whether it is polling live.

## Capabilities

- **Last updated time** — shows a short relative time, e.g. "Updated 5s ago".
- **Stale indicator** — switches to an amber "stale" state once the data is older
  than a configurable threshold (default 60s).
- **Live polling state** — shows a pulsing green dot and a "live" suffix while the
  view is actively fetching/polling.
- **Compact size** — a single rounded pill with a status dot and short text.
- **Accessible text** — exposes a full sentence via `role="status"`,
  `aria-live="polite"`, and an `aria-label`; the decorative dot is hidden from
  assistive tech.

## Main files

- `src/hooks/useRelativeTime.ts` — relative-time formatting, age, and staleness;
  re-renders on a cadence matched to the value's age.
- `src/components/LiveUpdatePill/LiveUpdatePill.tsx` — the pill component.
- `src/pages/Dashboard.tsx`, `src/pages/AssetDetail.tsx` — reuse sites.

## Update semantics

- **Timestamp source** — pass `updatedAt` from the data layer. The reuse sites use
  React Query's `dataUpdatedAt` (the last successful fetch time). `null` /
  invalid values render as "never".
- **Relative buckets** — `< 5s` → "just now", `< 60s` → "Ns ago",
  `< 60m` → "Nm ago", `< 24h` → "Nh ago", else "Nd ago".
- **Re-render cadence** — every 1s under a minute old, every 30s under an hour,
  every 5m beyond that. This keeps the text fresh without excessive renders.
- **Staleness** — `isStale` becomes true once `age > staleAfterMs`. A stale pill
  takes priority over the live state.
- **Polling** — when `polling` is true and the data is not stale, the pill shows
  the live (pulsing) state. While polling but stale, the stale state still wins.

## States

| State   | Dot            | Text example         |
| ------- | -------------- | -------------------- |
| live    | pulsing green  | `Updated 3s ago · live` |
| fresh   | green          | `Updated 12s ago`    |
| stale   | amber          | `Updated 5m ago · stale` |
| unknown | grey           | `Updated: never`     |

## Usage

```tsx
import { LiveUpdatePill } from "../components/LiveUpdatePill";

<LiveUpdatePill
  updatedAt={query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null}
  polling={query.isFetching}
  staleAfterMs={60_000}
  label="Updated"
/>;
```
