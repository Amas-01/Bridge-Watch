# Timeline Components

A comprehensive timeline system for displaying recent bridge, asset, and alert activity in the StellaBridge application.

## Components

### RecentActivityTimeline
Main timeline component that displays a chronological list of events with filtering and real-time updates.

### TimelineEventCard
Individual event card with expandable details and action buttons.

### TimelineEventIcon
Icon component that displays appropriate icons based on event type and severity.

### TimelineFilters
Filter controls for searching and filtering timeline events.

## Quick Start

```tsx
import { RecentActivityTimeline } from './components/timeline';

function MyPage() {
  return (
    <RecentActivityTimeline
      maxEvents={50}
      defaultMode="compact"
      showFilters={true}
    />
  );
}
```

## Features

- ✅ Real-time WebSocket updates
- ✅ Multiple event types (bridge, asset, alert, transaction, health)
- ✅ Filtering by type, severity, status, asset, bridge
- ✅ Search functionality
- ✅ Compact and expanded display modes
- ✅ Chronological ordering (newest/oldest first)
- ✅ Loading skeletons
- ✅ Empty and error states
- ✅ Responsive design
- ✅ Accessible (ARIA labels, keyboard navigation)
- ✅ Remove individual events
- ✅ Clear all events

## Event Types

| Type | Description | Icon |
|------|-------------|------|
| `bridge` | Bridge status updates | ⚡ Lightning bolt |
| `asset` | Asset price and metadata changes | 💰 Dollar sign |
| `alert` | System alerts and warnings | ⚠️ Warning triangle |
| `transaction` | Bridge transactions | ↔️ Arrows |
| `health` | Health score updates | 📊 Bar chart |

## Severity Levels

- **Info** (blue): Normal operational events
- **Warning** (yellow): Events requiring attention
- **Critical** (red): Urgent events requiring immediate action

## Props

### RecentActivityTimeline

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `defaultFilters` | `Partial<TimelineFilters>` | `{}` | Initial filter state |
| `defaultMode` | `'compact' \| 'expanded'` | `'compact'` | Initial display mode |
| `maxEvents` | `number` | `50` | Maximum events to display |
| `showFilters` | `boolean` | `true` | Show filter controls |
| `showHeader` | `boolean` | `true` | Show header section |
| `className` | `string` | `''` | Additional CSS classes |

## Filtering

Filters can be applied for:

- **Event Types**: Bridge, Asset, Alert, Transaction, Health
- **Severity**: Info, Warning, Critical
- **Status**: Active, Resolved, Pending, Completed, Failed
- **Search**: Text search across title and description
- **Asset Symbol**: Filter by specific asset (e.g., "USDC")
- **Bridge Name**: Filter by specific bridge (e.g., "Circle")

## WebSocket Integration

The timeline automatically subscribes to these channels:

- `bridges` - Bridge status updates
- `health` / `health-updates` - Health score changes
- `alerts` / `alert_notification` - Alert notifications

## Styling

The timeline uses Tailwind CSS with the Stellar design system:

- `stellar-card` - Card backgrounds
- `stellar-border` - Border colors
- `stellar-text-primary` - Primary text
- `stellar-text-secondary` - Secondary text
- `stellar-text-muted` - Muted text
- `stellar-blue` - Accent color

## Testing

```bash
# Run tests
npm test -- timeline

# Run tests in watch mode
npm run test:watch -- timeline

# Run tests with coverage
npm run test:coverage -- timeline
```

## Storybook

```bash
# Start Storybook
npm run storybook
```

Navigate to "Components/Timeline" to view all component variations.

## Accessibility

- Semantic HTML with proper heading hierarchy
- ARIA labels for all interactive elements
- Keyboard navigation support
- Focus indicators
- Screen reader friendly
- Color contrast compliant

## Performance

- Maximum event limit prevents memory issues
- Efficient filtering with `useMemo`
- Optimized re-renders with `useCallback`
- Lazy loading of event details

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## License

Part of the StellaBridge project.
