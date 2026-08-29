# Data Visualization Color System

## Goals

- Consistent chart colors across the frontend
- Theme-aware visualization tokens
- Colorblind-friendly categorical palette
- Accessible contrast checking support

## Palette groups

Defined in `frontend/src/styles/colors.ts`:

- `categorical`
- `categoricalColorblind`
- `sequential`
- `diverging`
- `status` (`success`, `warning`, `error`, `info`)

## Utilities

- `getVisualizationTheme()`
- `generateDynamicColor()`
- `contrastRatio()`
- `getColorblindModePreference()`
- `setColorblindModePreference()`

## Color preview tool

- Component: `frontend/src/components/ColorPreviewTool.tsx`
- Story: `frontend/src/components/ColorPreviewTool.stories.jsx`

The preview tool supports toggling colorblind mode and visual validation of palette categories.
