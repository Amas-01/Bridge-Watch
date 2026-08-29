/**
 * Hook for managing timeline events with real-time updates
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useWebSocketStore } from "../stores/webSocketStore";
import type {
  TimelineEvent,
  TimelineFilters,
  TimelineSortOrder,
  BridgeTimelineEvent,
  AlertTimelineEvent,
  HealthTimelineEvent,
} from "../types/timeline";
import type {
  WsBridgeMessage,
  WsHealthMessage,
  WsAlertMessage,
} from "../types";

const MAX_EVENTS = 100;

/**
 * Convert WebSocket messages to timeline events
 */
function convertBridgeMessage(msg: WsBridgeMessage): BridgeTimelineEvent {
  return {
    id: `bridge-${msg.name}-${Date.now()}`,
    type: "bridge",
    timestamp: msg.timestamp || new Date().toISOString(),
    title: `Bridge ${msg.name} status update`,
    description: `Status: ${msg.status}, TVL: $${msg.totalValueLocked.toLocaleString()}`,
    bridgeName: msg.name,
    bridgeStatus: msg.status,
    totalValueLocked: msg.totalValueLocked,
    mismatchPercentage: msg.mismatchPercentage,
    severity: msg.status === "down" ? "critical" : msg.status === "degraded" ? "warning" : "info",
    status: msg.status === "healthy" ? "active" : "pending",
  };
}

function convertHealthMessage(msg: WsHealthMessage): HealthTimelineEvent {
  return {
    id: `health-${msg.symbol}-${Date.now()}`,
    type: "health",
    timestamp: msg.lastUpdated || new Date().toISOString(),
    title: `Health score update for ${msg.symbol}`,
    description: `Score: ${msg.overallScore.toFixed(2)}, Trend: ${msg.trend}`,
    assetSymbol: msg.symbol,
    previousScore: 0, // Would need to track this
    currentScore: msg.overallScore,
    trend: msg.trend,
    severity: msg.overallScore < 50 ? "critical" : msg.overallScore < 75 ? "warning" : "info",
  };
}

function convertAlertMessage(msg: WsAlertMessage): AlertTimelineEvent {
  return {
    id: `alert-${Date.now()}-${Math.random()}`,
    type: "alert",
    timestamp: msg.timestamp || new Date().toISOString(),
    title: msg.message,
    description: msg.message,
    severity: msg.severity,
    assetSymbol: msg.symbol,
    bridgeName: msg.bridgeName,
    status: "active",
  };
}

interface UseTimelineEventsOptions {
  filters?: Partial<TimelineFilters>;
  sortOrder?: TimelineSortOrder;
  autoUpdate?: boolean;
  maxEvents?: number;
}

export function useTimelineEvents(options: UseTimelineEventsOptions = {}) {
  const {
    filters = {},
    sortOrder = "newest",
    autoUpdate = true,
    maxEvents = MAX_EVENTS,
  } = options;

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lastMessage = useWebSocketStore((state) => state.lastMessage);
  const isConnected = useWebSocketStore((state) => state.status === "connected");

  // Add new event to the timeline
  const addEvent = useCallback(
    (event: TimelineEvent) => {
      setEvents((prev) => {
        const newEvents = [event, ...prev].slice(0, maxEvents);
        return newEvents;
      });
    },
    [maxEvents]
  );

  // Process WebSocket messages
  useEffect(() => {
    if (!autoUpdate || !lastMessage) return;

    try {
      const { channel, data } = lastMessage;

      if (channel === "bridges" && data) {
        const bridgeEvent = convertBridgeMessage(data as WsBridgeMessage);
        addEvent(bridgeEvent);
      } else if (channel.startsWith("health")) {
        const healthEvent = convertHealthMessage(data as WsHealthMessage);
        addEvent(healthEvent);
      } else if (channel === "alerts" || channel === "alert_notification") {
        const alertEvent = convertAlertMessage(data as WsAlertMessage);
        addEvent(alertEvent);
      }
    } catch (err) {
      console.error("Error processing WebSocket message:", err);
    }
  }, [lastMessage, autoUpdate, addEvent]);

  // Load initial events (mock data for now)
  useEffect(() => {
    const loadInitialEvents = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // In a real implementation, this would fetch from an API
        // For now, we'll start with an empty array and rely on WebSocket updates
        await new Promise((resolve) => setTimeout(resolve, 500));
        setEvents([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load events");
      } finally {
        setIsLoading(false);
      }
    };

    loadInitialEvents();
  }, []);

  // Apply filters
  const filteredEvents = useMemo(() => {
    let filtered = [...events];

    // Filter by type
    if (filters.types && filters.types.length > 0) {
      filtered = filtered.filter((event) => filters.types!.includes(event.type));
    }

    // Filter by severity
    if (filters.severities && filters.severities.length > 0) {
      filtered = filtered.filter(
        (event) => event.severity && filters.severities!.includes(event.severity)
      );
    }

    // Filter by status
    if (filters.statuses && filters.statuses.length > 0) {
      filtered = filtered.filter(
        (event) => event.status && filters.statuses!.includes(event.status)
      );
    }

    // Filter by search query
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (event) =>
          event.title.toLowerCase().includes(query) ||
          event.description.toLowerCase().includes(query)
      );
    }

    // Filter by asset symbol
    if (filters.assetSymbol) {
      filtered = filtered.filter((event) => {
        if (event.type === "asset" || event.type === "health") {
          return event.assetSymbol === filters.assetSymbol;
        }
        if (event.type === "alert") {
          return event.assetSymbol === filters.assetSymbol;
        }
        if (event.type === "transaction") {
          return event.asset === filters.assetSymbol;
        }
        return false;
      });
    }

    // Filter by bridge name
    if (filters.bridgeName) {
      filtered = filtered.filter((event) => {
        if (event.type === "bridge") {
          return event.bridgeName === filters.bridgeName;
        }
        if (event.type === "alert") {
          return event.bridgeName === filters.bridgeName;
        }
        if (event.type === "transaction") {
          return event.bridge === filters.bridgeName;
        }
        return false;
      });
    }

    // Filter by date range
    if (filters.dateFrom) {
      const fromDate = new Date(filters.dateFrom);
      filtered = filtered.filter((event) => new Date(event.timestamp) >= fromDate);
    }

    if (filters.dateTo) {
      const toDate = new Date(filters.dateTo);
      filtered = filtered.filter((event) => new Date(event.timestamp) <= toDate);
    }

    return filtered;
  }, [events, filters]);

  // Apply sorting
  const sortedEvents = useMemo(() => {
    const sorted = [...filteredEvents];
    sorted.sort((a, b) => {
      const dateA = new Date(a.timestamp).getTime();
      const dateB = new Date(b.timestamp).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
    return sorted;
  }, [filteredEvents, sortOrder]);

  // Clear all events
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Remove a specific event
  const removeEvent = useCallback((eventId: string) => {
    setEvents((prev) => prev.filter((event) => event.id !== eventId));
  }, []);

  return {
    events: sortedEvents,
    totalEvents: events.length,
    filteredCount: sortedEvents.length,
    isLoading,
    error,
    isConnected,
    addEvent,
    clearEvents,
    removeEvent,
  };
}
