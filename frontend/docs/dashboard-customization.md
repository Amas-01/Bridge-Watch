# Dashboard Customization

## Capabilities

- Add/remove widgets from the dashboard canvas.
- Drag-and-drop reorder of widgets in the customization panel.
- Per-widget size controls (`small`, `medium`, `large`).
- Preset layouts (`default`, `compact`, `operations`, `analyst`).
- Asset filter panel with multi-select assets and bridges.
- Status filter (`all`, `healthy`, `warning`, `critical`).
- Time range presets (`all`, `24h`, `7d`, `30d`) applied to asset health update time.
- Saved filter presets for quick re-use.
- Clear-all action for active filters.
- URL-persisted filter state for shareable dashboard views.
- Reset to default layout.
- Layout export/import via JSON payload.
- Local persistence through browser storage.
- Responsive adaptation through CSS grid span classes.

## Main files

- `src/hooks/useDashboardLayout.ts`
- `src/hooks/useDashboardFilters.ts`
- `src/components/dashboard/WidgetGallery.tsx`
- `src/components/Filters/AssetFilterPanel.tsx`
- `src/pages/Dashboard.tsx`

## Dashboard filter URL parameters

- `assets`: comma-separated asset symbols (example: `USDC,EURC`).
- `bridges`: comma-separated bridge names (example: `Circle,Wormhole`).
- `status`: one of `all`, `healthy`, `warning`, `critical`.
- `range`: one of `all`, `24h`, `7d`, `30d`.

Example:

`/dashboard?assets=USDC,EURC&bridges=Circle&status=warning&range=7d`

## Persistence format

```json
{
  "widgets": [
    { "id": "quick-stats", "enabled": true, "size": "medium" },
    { "id": "asset-health", "enabled": true, "size": "large" },
    { "id": "bridge-status", "enabled": true, "size": "medium" }
  ]
}
```
