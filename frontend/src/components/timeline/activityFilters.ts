import type { TimelineEventType, TimelineFilters } from "../../types/timeline";

export type ActivityTimeRange = "all" | "1h" | "24h" | "7d";

export interface ActivityFilterState {
  timeRange: ActivityTimeRange;
  type: TimelineEventType | "all";
  source: string;
  searchQuery: string;
}

export const DEFAULT_ACTIVITY_FILTER_STATE: ActivityFilterState = {
  timeRange: "all",
  type: "all",
  source: "all",
  searchQuery: "",
};

export function toTimelineFilters(value: ActivityFilterState): Partial<TimelineFilters> {
  const filters: Partial<TimelineFilters> = {};
  if (value.type !== "all") filters.types = [value.type];
  if (value.searchQuery.trim()) filters.searchQuery = value.searchQuery.trim();
  if (value.source.startsWith("asset:")) filters.assetSymbol = value.source.slice("asset:".length);
  if (value.source.startsWith("bridge:")) filters.bridgeName = value.source.slice("bridge:".length);

  if (value.timeRange !== "all") {
    const durationMs: Record<Exclude<ActivityTimeRange, "all">, number> = {
      "1h": 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
    };
    filters.dateFrom = new Date(Date.now() - durationMs[value.timeRange]).toISOString();
  }

  return filters;
}

export function hasActivityFilters(value: ActivityFilterState): boolean {
  return (
    value.timeRange !== DEFAULT_ACTIVITY_FILTER_STATE.timeRange ||
    value.type !== DEFAULT_ACTIVITY_FILTER_STATE.type ||
    value.source !== DEFAULT_ACTIVITY_FILTER_STATE.source ||
    value.searchQuery.trim().length > 0
  );
}
