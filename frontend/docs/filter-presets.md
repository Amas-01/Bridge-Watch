# Filter Presets Menu

Save commonly used dashboard filter combinations and reapply them from a single menu.

## Capabilities

- **Save preset** — name and store the current dashboard filters (assets, bridges, status, time range).
- **Load preset** — apply a saved preset to the dashboard in one click.
- **Rename preset** — rename a preset inline; duplicate names are rejected.
- **Delete preset** — remove presets that are no longer needed.
- **Shared access options** — mark a preset as `Shared` or `Private`. Shared presets expose a "Copy link" action that produces a URL re-applying the preset's filters.
- **Persistent storage** — presets are persisted in browser local storage and survive reloads.

## Main files

- `src/hooks/useDashboardFilters.ts` — filter state, preset CRUD, share-URL builder.
- `src/components/Filters/FilterPresetsMenu.tsx` — dropdown menu UI.
- `src/components/Filters/AssetFilterPanel.tsx` — inline preset controls in the filter sidebar.
- `src/pages/Dashboard.tsx` — wires the menu into the dashboard toolbar.

## Workflow

1. Apply one or more filters on the dashboard (assets, bridges, status, time range).
2. Open the **Presets** menu in the dashboard toolbar.
3. Enter a name and choose **Save**. The current filter combination is stored.
4. Reopen the menu at any time and click a preset name to reapply it.
5. Use **Rename**, **Make shared / Make private**, or **Delete** under each preset.
6. For shared presets, choose **Copy link** to share a URL that opens the dashboard with the preset's filters applied.

## Preset definition

```ts
interface DashboardFilterPreset {
  id: string;
  name: string;
  filters: {
    assets: string[];
    bridges: string[];
    status: "all" | "healthy" | "warning" | "critical";
    timeRange: "all" | "24h" | "7d" | "30d";
  };
  shared: boolean;
  createdAt: number;
  updatedAt: number;
}
```

## Persistence

- Storage key: `bridge-watch:dashboard-filter-presets:v1`.
- Stored as a JSON array of `DashboardFilterPreset` objects.
- Presets saved before the shared/timestamp fields existed are normalized on read
  (`shared` defaults to `false`, timestamps default to the current time).

## Shared links

A shared preset's link encodes the filters as dashboard URL search params, e.g.:

`/dashboard?assets=USDC,EURC&bridges=Circle&status=warning&range=7d`

Opening the link applies those filters because dashboard filter state is URL-persisted.
