# Dashboard Tour

A lightweight, accessible overlay that guides new users through the main
dashboard regions.

## Capabilities

- **Step-by-step guide** — walks the user through key dashboard regions with a
  spotlight and a tooltip per step.
- **Skip and resume** — the tour can be skipped at any point and resumes at the
  last viewed step the next time it is started.
- **Responsive positioning** — the spotlight and tooltip recompute on resize and
  scroll, and the tooltip is clamped within the viewport.
- **Accessible navigation** — the tooltip is a focusable modal dialog with ARIA
  labelling; supports keyboard navigation (`←`/`→` to move, `Esc` to skip) and
  moves focus to each step.
- **Persist completion** — completion and the last-viewed step are stored in
  local storage, so the tour auto-starts only once and remembers progress.

## Main files

- `src/hooks/useDashboardTour.ts` — tour state, persistence, skip/resume logic.
- `src/components/dashboard/DashboardTour.tsx` — overlay, spotlight, tooltip.
- `src/pages/Dashboard.tsx` — step definitions, region markers, trigger button.

## Flow

1. On a user's first visit the tour auto-starts at step one.
2. Each step highlights a dashboard region (`data-tour="..."`) and shows a
   tooltip with the step title, description, progress dots, and controls.
3. Navigate with **Back** / **Next**, the arrow keys, or **Skip**.
4. **Skip** (button, `Esc`, or clicking the backdrop) closes the tour but keeps
   the current step so it can be resumed.
5. **Finish** on the last step marks the tour completed.
6. Users can re-open the tour at any time via the **Take a tour** / **Replay
   tour** button in the dashboard toolbar.

## Step definition

```ts
interface TourStep {
  id: string;
  target: string; // CSS selector, e.g. '[data-tour="kpis"]'
  title: string;
  body: string;
  placement?: "top" | "bottom" | "left" | "right" | "auto";
}
```

Region markers currently used on the dashboard:

- `[data-tour="toolbar"]` — preset/refresh/export/share actions.
- `[data-tour="filters"]` — the asset/bridge filter panel.
- `[data-tour="kpis"]` — the key-metrics banner.
- `[data-tour="status-cards"]` — the inline status cards.

## Persistence

- Storage key: `bridge-watch:dashboard-tour:v1`.
- Stored shape: `{ completed: boolean, lastStep: number, seen: boolean }`.
  - `seen` suppresses auto-start after the first run.
  - `lastStep` enables skip-and-resume.
  - `completed` is set when the user finishes the final step.
