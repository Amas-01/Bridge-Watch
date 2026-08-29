# Approach Statement — Issue #466: Service Health Pulse Widget

## Status Data Source
- **Endpoint**: `/api/v1/external-dependencies` via `getExternalDependencies()` in `services/api.ts`
- **Response Shape**: 
  ```typescript
  {
    dependencies: ExternalDependency[],
    summary: {
      healthy: number,
      degraded: number,
      down: number,
      maintenance: number,
      unknown: number
    }
  }
  ```
- **Status Values**: "healthy" | "degraded" | "down" | "maintenance" | "unknown"
- **Fetching Pattern**: React Query `useQuery` with 60-second polling interval (matching existing `ExternalDependencyPanel`)

## Framework & Styling
- **Framework**: React 18 with TypeScript
- **Styling**: TailwindCSS with dark mode via `class` strategy
- **Theme Mechanism**: CSS variables (`--stellar-*`) defined in `index.css`, accessed via Tailwind utility classes
- **Status Colors** (following existing patterns):
  - Healthy: `bg-green-500`, `text-green-400`
  - Degraded: `bg-yellow-500`/`bg-amber-500`, `text-yellow-400`/`text-amber-400`
  - Down: `bg-red-500`, `text-red-400`
  - Maintenance: `bg-blue-500`, `text-blue-400`
  - Unknown: `bg-gray-500`, `text-gray-400`

## Component Structure
Following the established pattern in `frontend/src/components/`:
- **File**: `frontend/src/components/ServiceHealthPulse.tsx`
- **Props Interface**: Inline TypeScript interface with:
  - `compact?: boolean` (default: true)
  - `className?: string` (for custom styling)
- **Export**: Default export of main component, named export of skeleton

## Compact vs. Detailed Mode
- **Compact Mode** (default):
  - Single pulse indicator (animated dot) showing overall status
  - Brief status label ("All systems operational", "Degraded", "Service disruption", "Maintenance", "Unknown")
  - Service count summary (e.g., "5 services")
  - Last updated timestamp (relative time)
  - Expand/collapse toggle button
- **Detailed Mode** (expanded):
  - All compact mode content
  - Per-service breakdown list with:
    - Service name
    - Individual status indicator (colored dot)
    - Status label
  - Smooth CSS transition on max-height for expansion animation

## Overall Pulse Aggregation Logic
Following worst-case aggregation (matching existing patterns):
1. If any service is "down" → overall status is "down"
2. Else if any service is "degraded" → overall status is "degraded"
3. Else if any service is "maintenance" → overall status is "maintenance"
4. Else if all services are "healthy" → overall status is "healthy"
5. Else → overall status is "unknown"

## Accessibility Strategy
- **ARIA Roles**: 
  - `role="status"` on overall pulse indicator
  - `role="list"` and `role="listitem"` for service breakdown
- **Live Regions**: `aria-live="polite"` on overall status for screen reader announcements
- **Color Independence**: 
  - Every status indicator includes text label
  - Status dots have `aria-hidden="true"` with adjacent text
- **Keyboard Navigation**: 
  - Expand/collapse button is keyboard accessible
  - `aria-expanded` attribute on toggle button
  - `aria-controls` linking button to content region
- **Focus Indicators**: Tailwind `focus:ring-2 focus:ring-stellar-blue` on interactive elements

## Files to Create
1. `frontend/src/components/ServiceHealthPulse.tsx` — Main widget component
2. `frontend/src/components/ServiceHealthPulse.test.tsx` — Component tests
3. `frontend/src/hooks/useServiceHealth.ts` — Data fetching hook
4. `frontend/src/hooks/useServiceHealth.test.ts` — Hook tests
5. `frontend/docs/service-health-pulse-widget.md` — Component documentation

## Files to Modify
1. `frontend/src/test/mocks/handlers.ts` — Add mock for `/api/v1/external-dependencies` endpoint

## Implementation Plan
1. Create `useServiceHealth` hook with React Query
2. Create `ServiceHealthPulse` component with compact/detailed modes
3. Write comprehensive tests for hook and component
4. Add MSW mock handler for testing
5. Create component documentation
6. Run all CI checks locally before PR

## CI Verification Checklist
- [ ] `npm run lint` — Zero errors
- [ ] `npm run build` — Successful build
- [ ] `npm run test` — All tests pass
- [ ] Type-check via build — Zero errors
- [ ] Accessibility — No vitest-axe violations
