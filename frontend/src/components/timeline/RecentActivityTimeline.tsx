/**
 * Recent Activity Timeline Component
 * Displays a chronological timeline of bridge, asset, and alert activity
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useTimelineEvents } from "../../hooks/useTimelineEvents";
import TimelineEventCard from "./TimelineEventCard";
import ActivityFiltersBar from "./ActivityFiltersBar";
import {
  DEFAULT_ACTIVITY_FILTER_STATE,
  toTimelineFilters,
  type ActivityFilterState,
} from "./activityFilters";
import type {
  TimelineFilters as TimelineFiltersType,
  TimelineDisplayMode,
  TimelineSortOrder,
} from "../../types/timeline";

interface RecentActivityTimelineProps {
  defaultFilters?: Partial<TimelineFiltersType>;
  defaultMode?: TimelineDisplayMode;
  maxEvents?: number;
  showFilters?: boolean;
  showHeader?: boolean;
  className?: string;
  sourceOptions?: string[];
}

const ACTIVITY_FILTERS_STORAGE_KEY = "bridge-watch:activity-filters";

function buildInitialFilters(
  defaults: Partial<TimelineFiltersType>,
): ActivityFilterState {
  try {
    const raw = localStorage.getItem(ACTIVITY_FILTERS_STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<ActivityFilterState>;
      return { ...DEFAULT_ACTIVITY_FILTER_STATE, ...stored };
    }
  } catch {
    // Ignore malformed stored filters and fall back to defaults.
  }

  return {
    ...DEFAULT_ACTIVITY_FILTER_STATE,
    type: defaults.types?.[0] ?? "all",
    source: defaults.assetSymbol
      ? `asset:${defaults.assetSymbol}`
      : defaults.bridgeName
        ? `bridge:${defaults.bridgeName}`
        : "all",
    searchQuery: defaults.searchQuery ?? "",
  };
}

export default function RecentActivityTimeline({
  defaultFilters = {},
  defaultMode = "compact",
  maxEvents = 50,
  showFilters = true,
  showHeader = true,
  className = "",
  sourceOptions = [],
}: RecentActivityTimelineProps) {
  const [activityFilters, setActivityFilters] = useState<ActivityFilterState>(() =>
    buildInitialFilters(defaultFilters),
  );
  const [displayMode, setDisplayMode] = useState<TimelineDisplayMode>(defaultMode);
  const [sortOrder, setSortOrder] = useState<TimelineSortOrder>("newest");
  const timelineFilters = useMemo(
    () => toTimelineFilters(activityFilters),
    [activityFilters],
  );

  const {
    events,
    totalEvents,
    filteredCount,
    isLoading,
    error,
    isConnected,
    clearEvents,
    removeEvent,
  } = useTimelineEvents({
    filters: timelineFilters,
    sortOrder,
    autoUpdate: true,
    maxEvents,
  });

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVITY_FILTERS_STORAGE_KEY, JSON.stringify(activityFilters));
    } catch {
      // Activity filters still work without persistence.
    }
  }, [activityFilters]);

  const handleClearFilters = useCallback(() => {
    setActivityFilters(DEFAULT_ACTIVITY_FILTER_STATE);
  }, []);

  const toggleSortOrder = useCallback(() => {
    setSortOrder((prev) => (prev === "newest" ? "oldest" : "newest"));
  }, []);

  const toggleDisplayMode = useCallback(() => {
    setDisplayMode((prev) => (prev === "compact" ? "expanded" : "compact"));
  }, []);

  return (
    <section className={`space-y-4 ${className}`} aria-label="Recent Activity Timeline">
      {/* Header */}
      {showHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
            {!isConnected && (
              <span className="text-xs text-yellow-400 flex items-center gap-1">
                <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="8" />
                </svg>
                Connecting...
              </span>
            )}
            {isConnected && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="8" />
                </svg>
                Live
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-stellar-text-muted">
              {filteredCount} of {totalEvents} events
            </span>

            {/* Display mode toggle */}
            <button
              onClick={toggleDisplayMode}
              className="p-2 bg-stellar-card border border-stellar-border rounded hover:bg-stellar-card-hover transition-colors"
              aria-label={`Switch to ${displayMode === "compact" ? "expanded" : "compact"} mode`}
              title={`Switch to ${displayMode === "compact" ? "expanded" : "compact"} mode`}
            >
              {displayMode === "compact" ? (
                <svg className="w-4 h-4 text-stellar-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-stellar-text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              )}
            </button>

            {/* Sort order toggle */}
            <button
              onClick={toggleSortOrder}
              className="p-2 bg-stellar-card border border-stellar-border rounded hover:bg-stellar-card-hover transition-colors"
              aria-label={`Sort by ${sortOrder === "newest" ? "oldest" : "newest"} first`}
              title={`Sort by ${sortOrder === "newest" ? "oldest" : "newest"} first`}
            >
              <svg
                className={`w-4 h-4 text-stellar-text-secondary transition-transform ${sortOrder === "oldest" ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
            </button>

            {/* Clear all button */}
            {totalEvents > 0 && (
              <button
                onClick={clearEvents}
                className="px-3 py-2 bg-stellar-card border border-stellar-border rounded text-xs text-red-400 hover:bg-stellar-card-hover transition-colors"
                aria-label="Clear all events"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <ActivityFiltersBar
          value={activityFilters}
          sourceOptions={sourceOptions}
          onChange={setActivityFilters}
          onReset={handleClearFilters}
        />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <article
              key={i}
              className="border border-stellar-border rounded-lg p-4 animate-pulse bg-stellar-card"
              aria-busy="true"
            >
              <div className="flex gap-3">
                <div className="w-5 h-5 bg-stellar-border rounded" />
                <div className="flex-grow space-y-2">
                  <div className="h-4 bg-stellar-border rounded w-1/4" />
                  <div className="h-3 bg-stellar-border rounded w-3/4" />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="border border-red-700 rounded-lg p-4 bg-red-900/20 text-red-400 text-sm">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>Failed to load timeline events. {error}</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && events.length === 0 && (
        <div className="border border-stellar-border rounded-lg p-8 text-center">
          <svg
            className="w-12 h-12 mx-auto mb-3 text-stellar-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="font-medium text-white">No activity yet</p>
          <p className="text-sm text-stellar-text-secondary mt-1">
            {totalEvents === 0
              ? "Events will appear here as they occur."
              : "No events match your current filters."}
          </p>
        </div>
      )}

      {/* Timeline events */}
      {!isLoading && !error && events.length > 0 && (
        <div className="space-y-3 relative">
          {/* Timeline line */}
          <div className="absolute left-[18px] top-0 bottom-0 w-px bg-stellar-border" aria-hidden="true" />

          {/* Events list */}
          <div className="space-y-3 relative z-10">
            {events.map((event) => (
              <TimelineEventCard
                key={event.id}
                event={event}
                mode={displayMode}
                onRemove={removeEvent}
              />
            ))}
          </div>

          {/* Load more indicator */}
          {filteredCount >= maxEvents && (
            <div className="text-center py-4">
              <p className="text-sm text-stellar-text-muted">
                Showing {maxEvents} most recent events
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
