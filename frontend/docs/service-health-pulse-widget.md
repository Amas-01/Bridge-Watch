# Service Health Pulse Widget

## Overview

The Service Health Pulse widget provides a compact visual indicator of overall platform status with an expandable per-service breakdown. It connects to the external dependencies monitoring system to display real-time health status across all monitored services.

## Components

- `src/components/ServiceHealthPulse.tsx` — Main widget component
- `src/hooks/useServiceHealth.ts` — Data fetching hook

## Features

- **Compact Mode** (default): Single pulse indicator with overall status and service count
- **Detailed Mode**: Expandable list showing individual service statuses
- **Real-time Updates**: Polls service health data every 60 seconds
- **Theme Support**: Full light and dark mode support via Tailwind CSS
- **Accessibility**: WCAG 2.1 AA compliant with screen reader support and color-independent status indicators

## Props Interface

```typescript
interface ServiceHealthPulseProps {
  compact?: boolean;    // Default: true - controls initial collapsed state
  className?: string;   // Additional CSS classes for custom styling
}
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `compact` | `boolean` | `true` | When `true`, the widget starts in collapsed mode. When `false`, service breakdown is initially visible. |
| `className` | `string` | `""` | Additional CSS classes applied to the root container. |

## Display Modes

### Compact Mode (Default)

Shows:
- Animated pulse indicator (color-coded by status)
- Overall status label
- Total service count
- Last updated timestamp
- Expand/collapse toggle button

### Detailed Mode (Expanded)

Shows all compact mode content plus:
- Per-service breakdown list
- Individual service names
- Status indicator for each service
- Status label for each service

## Status Values

The widget displays one of five possible statuses:

| Status | Label | Color | Pulse Animation | Priority |
|--------|-------|-------|-----------------|----------|
| `healthy` | "All systems operational" | Green | Yes | Lowest |
| `degraded` | "Degraded performance" | Yellow | Yes | Medium |
| `down` | "Service disruption" | Red | Yes | Highest |
| `maintenance` | "Scheduled maintenance" | Blue | No | Medium-High |
| `unknown` | "Status unknown" | Gray | No | Low |

## Overall Status Aggregation

The overall status is determined using worst-case aggregation:

1. If any service is `down` → overall status is `down`
2. Else if any service is `degraded` → overall status is `degraded`
3. Else if any service is `maintenance` → overall status is `maintenance`
4. Else if any service is `unknown` → overall status is `unknown`
5. Else → overall status is `healthy`

## Data Source

The widget connects to the `/api/v1/external-dependencies` endpoint via the `useServiceHealth` hook. This endpoint provides:

- List of monitored external services
- Current status for each service
- Summary counts by status type

The hook polls this endpoint every 60 seconds by default and can be configured with custom refresh intervals.

## Usage Examples

### Basic Usage (Compact)

```tsx
import ServiceHealthPulse from './components/ServiceHealthPulse';

function Dashboard() {
  return (
    <div>
      <ServiceHealthPulse />
    </div>
  );
}
```

### Expanded by Default

```tsx
import ServiceHealthPulse from './components/ServiceHealthPulse';

function StatusPage() {
  return (
    <div>
      <ServiceHealthPulse compact={false} />
    </div>
  );
}
```

### With Custom Styling

```tsx
import ServiceHealthPulse from './components/ServiceHealthPulse';

function Sidebar() {
  return (
    <div>
      <ServiceHealthPulse className="shadow-lg" />
    </div>
  );
}
```

### Using the Hook Directly

```tsx
import { useServiceHealth } from './hooks/useServiceHealth';

function CustomHealthDisplay() {
  const { data, isLoading, isError } = useServiceHealth();

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error loading health data</div>;

  return (
    <div>
      <h2>Overall Status: {data.overallStatus}</h2>
      <p>Total Services: {data.totalServices}</p>
      <p>Healthy: {data.healthyCount}</p>
      <p>Degraded: {data.degradedCount}</p>
      <p>Down: {data.downCount}</p>
    </div>
  );
}
```

## Theme Requirements

The widget uses the following Tailwind CSS classes and CSS variables:

### CSS Variables (from `index.css`)
- `--stellar-bg` — Background color
- `--stellar-card` — Card background
- `--stellar-border` — Border color
- `--stellar-text-primary` — Primary text
- `--stellar-text-secondary` — Secondary text

### Status Colors
- Green: `bg-green-500`, `text-green-400`
- Yellow: `bg-yellow-500`, `text-yellow-400`
- Red: `bg-red-500`, `text-red-400`
- Blue: `bg-blue-500`, `text-blue-400`
- Gray: `bg-gray-500`, `text-gray-400`

All colors automatically adapt to light and dark themes via Tailwind's dark mode.

## Accessibility

The widget follows WCAG 2.1 AA guidelines:

### Screen Reader Support
- `role="status"` on overall pulse indicator
- `aria-live="polite"` for status change announcements
- `role="list"` and `role="listitem"` for service breakdown
- Descriptive `aria-label` attributes on all interactive elements

### Keyboard Navigation
- Expand/collapse button is fully keyboard accessible
- `aria-expanded` attribute indicates current state
- `aria-controls` links button to content region
- Visible focus indicators on all interactive elements

### Color Independence
- Every status indicator includes a text label
- Status dots are marked `aria-hidden="true"` with adjacent text
- No information conveyed by color alone

## Testing

The widget includes comprehensive test coverage:

### Component Tests (`ServiceHealthPulse.test.tsx`)
- Loading state rendering
- All status values (healthy, degraded, down, maintenance, unknown)
- Expand/collapse functionality
- Error state handling
- Empty service list handling
- Accessibility compliance (vitest-axe)
- Custom className application

### Hook Tests (`useServiceHealth.test.ts`)
- Data fetching and aggregation
- Status priority logic
- Error handling
- Empty data handling

Run tests with:
```bash
npm test ServiceHealthPulse
```

## Related Components

- `ExternalDependencyPanel` — Detailed view of external dependencies with history
- `ConnectionStatus` — WebSocket connection status indicator
- `BridgeStatusCard` — Individual bridge health status

## Future Enhancements

Potential improvements for future iterations:

- Click-through to detailed dependency view
- Historical status timeline
- Configurable polling interval via props
- Status change notifications
- Export status data
