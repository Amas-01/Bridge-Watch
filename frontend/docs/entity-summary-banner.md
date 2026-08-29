# Entity Summary Banner

A banner that surfaces the most important summary fields for the selected entity
(asset, bridge, etc.) at the top of its detail page.

## Capabilities

- **Summary fields** — shows the key metrics for an entity in a compact grid.
- **Context sensitive** — the calling page supplies the field set, so each entity
  type shows the fields that matter for it (e.g. assets show health, price,
  liquidity, trend).
- **Compact layout** — dense by default; values, status dots, and trend chips.
- **Compact and expanded modes** — a built-in toggle switches between a dense grid
  and an expanded layout that reveals per-field hint text.
- **Loading state** — renders skeleton cards while the underlying data loads.
- **Drilldown links** — each field can link to a route (`to`) or trigger an
  in-page drilldown (`onDrilldown`, e.g. switching detail tabs).

## Main files

- `src/components/entity/EntitySummaryBanner.tsx` — the banner component.
- `src/components/entity/index.ts` — public exports.
- `src/pages/AssetDetail.tsx` — integration for the asset entity.

## Behaviour

- The banner header shows an entity-type badge, the entity title, and an optional
  subtitle. An `actions` slot holds page-level controls (refresh, watchlist, etc.).
- The mode toggle (top-right) flips between **Compact view** and **Expanded view**.
  Expanded mode shows each field's `hint` for extra context.
- Each field renders its label, value, an optional status dot
  (`healthy` / `warning` / `critical` / `neutral`), and an optional trend chip
  (`up` / `down` / `neutral`).
- A field with `to` renders a router `Link`; a field with `onDrilldown` renders a
  button. The affordance label defaults to "View" and can be overridden with
  `drilldownLabel`.
- While `loading` is true, the banner renders skeleton cards (at least four).

## Usage

```tsx
import { EntitySummaryBanner, type EntitySummaryField } from "../components/entity";

const fields: EntitySummaryField[] = [
  {
    id: "health",
    label: "Health score",
    value: "82/100",
    status: "healthy",
    trend: { direction: "up", label: "Improving" },
    hint: "Composite health score across all factors.",
    onDrilldown: () => setTab("summary"),
    drilldownLabel: "Open summary",
  },
  // ...more fields
];

<EntitySummaryBanner
  entityType="Asset"
  title="USDC"
  subtitle="Detailed monitoring for USDC on the Stellar network"
  fields={fields}
  loading={isLoading}
  defaultMode="compact"
/>;
```

## Reuse

The banner is entity-agnostic: any detail page can build its own
`EntitySummaryField[]` and render the banner. This keeps the layout, loading
state, mode toggle, and drilldown behaviour consistent across entity types.
