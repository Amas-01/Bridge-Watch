# Dashboard KPI, Drilldown, Legend, and Sharing Behavior

The dashboard surfaces a compact KPI banner above the existing overview cards. KPIs are computed from the currently filtered assets and bridges, so asset filters, bridge filters, favorites mode, time range, and dashboard view state all affect the values users see.

## KPI Banner

- `Total value locked` sums TVL across filtered bridges.
- `Monitored assets` counts filtered assets and shows improving versus deteriorating trend context.
- `Active bridges` counts filtered bridges whose status is not `down`.
- `System health` averages filtered asset health scores and highlights bridges with mismatch above 1%.

The banner supports compact and expanded layouts. Overview mode uses the expanded card copy, while asset-only and bridge-only modes use the compact scan layout. Loading states render skeleton cards until asset and bridge queries settle.

Each KPI card is a button. Selecting a KPI opens a slide-out drilldown drawer and writes `drilldown=<id>` to the URL for deep linking.

## Drilldown Drawer

The drawer is context aware. KPI drilldowns show summary metrics and the most relevant filtered rows for that KPI. The drawer supports:

- Escape to close.
- Tab focus containment while open.
- Back and close actions.
- Mobile full-width layout and wider desktop slide-out layout.
- Deep-linked state through the `drilldown` query parameter.

Dashboard cards can also open the drawer for in-page inspection without navigating away from the dashboard.

## Chart Legend Controls

Price charts use interactive legend controls above the chart canvas. Users can toggle individual price source series, sort the legend by source name or latest value, and use the controls on touch devices because each item has a minimum target height. The buttons expose pressed state and descriptive labels for assistive technology.

At least one series remains visible when toggling sources.

## Sharing Flow

The dashboard share modal generates a link from the current URL, preserving filters, dashboard view, bridge status, and drawer state. Users can choose an expiration hint and read-only preview mode. Copy and preview actions are available from the modal.

Read-only share links are hints for the frontend experience and do not grant export, configuration, or write permissions.
