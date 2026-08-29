# Recent Activity Timeline

## Overview

The Recent Activity Timeline component provides a chronological view of bridge, asset, and alert activity with real-time updates via WebSocket connections.

## Features

- **Chronological Ordering**: Events are displayed in reverse chronological order (newest first) by default
- **Event Type Icons**: Visual indicators for different event types (bridge, asset, alert, transaction, health)
- **Filtering**: Filter by event type, severity, status, asset symbol, bridge name, and search query
- **Persistent Activity Bar**: Top-level time, type, source, and search filters persist across reloads
- **Display Modes**: Toggle between compact and expanded views
- **Real-time Updates**: Automatically receives and displays new events via WebSocket
- **Loading Skeletons**: Smooth loading states while fetching data
- **Responsive Scrolling**: Optimized for mobile and desktop viewing
- **Accessible Semantics**: ARIA labels and semantic HTML for screen readers

## Components

### RecentActivityTimeline

Main timeline component that orchestrates the display of events.

**Props:**
- `defaultFilters?: Partial<TimelineFilters>` - Initial filter state
- `defaultMode?: TimelineDisplayMode` - Initial display mode ('compact' | 'expanded')
- `maxEvents?: number` - Maximum number of events to display (default: 50)
- `showFilters?: boolean` - Show/hide filter controls (default: true)
- `showHeader?: boolean` - Show/hide header section (default: true)
- `className?: string` - Additional CSS classes

**Usage:**
```tsx
import { RecentActivityTimeline } from '../components/timeline';

function Dashboard() {
  return (
    <RecentActivityTimeline
      maxEvents={100}
      defaultMode="compact"
      showFilters={true}
    />
  );
}
```

### TimelineEventCard

Individual event card component with expandable details.

**Props:**
- `event: TimelineEvent` - Event data to display
- `mode?: TimelineDisplayMode` - Display mode
- `onRemove?: (eventId: string) => void` - Callback for removing events

### TimelineEventIcon

Icon component for different event types with severity indicators.

**Props:**
- `type: TimelineEventType` - Event type ('bridge' | 'asset' | 'alert' | 'transaction' | 'health')
- `severity?: TimelineEventSeverity` - Severity level ('info' | 'warning' | 'critical')
- `className?: string` - Additional CSS classes

### TimelineFilters

Advanced filter controls for the timeline.

**Props:**
- `filters: Partial<TimelineFilters>` - Current filter state
- `onFiltersChange: (filters: Partial<TimelineFilters>) => void` - Filter change callback
- `onClearFilters: () => void` - Clear filters callback

## Data Model

### TimelineEvent Types

```typescript
type TimelineEventType = "bridge" | "asset" | "alert" | "transaction" | "health";

interface BridgeTimelineEvent {
  id: string;
  type: "bridge";
  timestamp: string;
  title: string;
  description: string;
  bridgeName: string;
  bridgeStatus: "healthy" | "degraded" | "down" | "unknown";
  totalValueLocked?: number;
  mismatchPercentage?: number;
  severity?: "info" | "warning" | "critical";
  status?: "active" | "resolved" | "pending";
}

// Similar interfaces for AssetTimelineEvent, AlertTimelineEvent, 
// TransactionTimelineEvent, and HealthTimelineEvent
```

## WebSocket Integration

The timeline automatically subscribes to relevant WebSocket channels:

- `bridges` - Bridge status updates
- `health` / `health-updates` - Health score changes
- `alerts` / `alert_notification` - Alert notifications

Events are converted from WebSocket messages to timeline events using the `useTimelineEvents` hook.

## Filtering

Filters can be applied for:

- **Time Range**: All time, last hour, last 24 hours, or last 7 days
- **Event Types**: Bridge, Asset, Alert, Transaction, Health
- **Source**: Asset or bridge source selector
- **Severity**: Info, Warning, Critical
- **Status**: Active, Resolved, Pending, Completed, Failed
- **Search Query**: Text search across title and description
- **Asset Symbol**: Filter by specific asset
- **Bridge Name**: Filter by specific bridge
- **Date Range**: Filter by date range (future enhancement)

The top activity filter bar stores its state in local storage under
`bridge-watch:activity-filters`.

## Accessibility

- Semantic HTML structure with proper ARIA labels
- Keyboard navigation support
- Screen reader friendly
- Color contrast compliant
- Focus indicators on interactive elements

## Performance Considerations

- Maximum event limit prevents memory issues
- Efficient filtering with useMemo
- Optimized re-renders with useCallback
- Virtual scrolling for large lists (future enhancement)

## Future Enhancements

- [ ] Virtual scrolling for better performance with large datasets
- [ ] Export timeline data (CSV, JSON)
- [ ] Bookmark/pin important events
- [ ] Event grouping by time periods
- [ ] Advanced date range filtering
- [ ] Event annotations and notes
- [ ] Share specific timeline views
- [ ] Integration with notification system
- [ ] Customizable event retention period
- [ ] Event search with advanced operators

## Testing

Run tests with:
```bash
npm test -- timeline
```

## Storybook

View component stories:
```bash
npm run storybook
```

Navigate to "Timeline" section to see all component variations.
