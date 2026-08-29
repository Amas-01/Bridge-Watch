# Visual Regression Test Suite

This project uses Playwright screenshot tests to protect the layout of critical dashboard views.

## Covered views

- Dashboard empty state
- Bridges empty state
- Asset detail baseline view

## Running the suite

```bash
npm --workspace=frontend run test:visual
```

## Updating baselines

When a design change is intentional, refresh the screenshots with:

```bash
npm --workspace=frontend run test:visual:update
```

The suite runs across Chromium, Firefox, and WebKit with deterministic rendering settings.