import type { TimelineEventType } from "../../types/timeline";
import {
  hasActivityFilters,
  type ActivityFilterState,
  type ActivityTimeRange,
} from "./activityFilters";

interface ActivityFiltersBarProps {
  value: ActivityFilterState;
  sourceOptions: string[];
  onChange: (value: ActivityFilterState) => void;
  onReset: () => void;
}

const TYPE_OPTIONS: Array<{ value: TimelineEventType | "all"; label: string }> = [
  { value: "all", label: "All types" },
  { value: "bridge", label: "Bridge" },
  { value: "asset", label: "Asset" },
  { value: "alert", label: "Alert" },
  { value: "transaction", label: "Transaction" },
  { value: "health", label: "Health" },
];

const TIME_OPTIONS: Array<{ value: ActivityTimeRange; label: string }> = [
  { value: "all", label: "All time" },
  { value: "1h", label: "Last hour" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
];

function updateFilter(
  current: ActivityFilterState,
  patch: Partial<ActivityFilterState>,
): ActivityFilterState {
  return { ...current, ...patch };
}

export default function ActivityFiltersBar({
  value,
  sourceOptions,
  onChange,
  onReset,
}: ActivityFiltersBarProps) {
  const active = hasActivityFilters(value);

  return (
    <div className="rounded-lg border border-stellar-border bg-stellar-card p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="activity-time-filter"
              className="mb-1 block text-xs font-medium uppercase text-stellar-text-secondary"
            >
              Time
            </label>
            <select
              id="activity-time-filter"
              value={value.timeRange}
              onChange={(event) =>
                onChange(updateFilter(value, { timeRange: event.target.value as ActivityTimeRange }))
              }
              className="min-h-10 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 text-sm text-stellar-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
            >
              {TIME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="activity-type-filter"
              className="mb-1 block text-xs font-medium uppercase text-stellar-text-secondary"
            >
              Type
            </label>
            <select
              id="activity-type-filter"
              value={value.type}
              onChange={(event) =>
                onChange(updateFilter(value, { type: event.target.value as TimelineEventType | "all" }))
              }
              className="min-h-10 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 text-sm text-stellar-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="activity-source-filter"
              className="mb-1 block text-xs font-medium uppercase text-stellar-text-secondary"
            >
              Source
            </label>
            <select
              id="activity-source-filter"
              value={value.source}
              onChange={(event) => onChange(updateFilter(value, { source: event.target.value }))}
              className="min-h-10 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 text-sm text-stellar-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
            >
              <option value="all">All sources</option>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source.startsWith("asset:") ? `Asset: ${source.slice(6)}` : `Bridge: ${source.slice(7)}`}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row lg:w-[24rem]">
          <div className="flex-1">
            <label htmlFor="activity-search-filter" className="sr-only">
              Search activity
            </label>
            <input
              id="activity-search-filter"
              type="search"
              autoComplete="off"
              placeholder="Search activity"
              value={value.searchQuery}
              onChange={(event) =>
                onChange(updateFilter(value, { searchQuery: event.target.value }))
              }
              className="min-h-10 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 text-sm text-stellar-text-primary placeholder-stellar-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
            />
          </div>

          <button
            type="button"
            onClick={onReset}
            disabled={!active}
            className="min-h-10 rounded-md border border-stellar-border px-4 text-sm font-medium text-stellar-text-primary transition-colors hover:border-stellar-blue hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
