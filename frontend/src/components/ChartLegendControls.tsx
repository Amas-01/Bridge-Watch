export type LegendSortMode = "name" | "value";

export interface LegendSeries {
  id: string;
  label: string;
  color: string;
  latestValue?: number;
}

interface ChartLegendControlsProps {
  series: LegendSeries[];
  visibleSeries: string[];
  sortMode: LegendSortMode;
  compact?: boolean;
  valueFormatter?: (value: number) => string;
  onToggleSeries: (id: string) => void;
  onSortModeChange: (mode: LegendSortMode) => void;
}

export default function ChartLegendControls({
  series,
  visibleSeries,
  sortMode,
  compact = false,
  valueFormatter = (value) => String(value),
  onToggleSeries,
  onSortModeChange,
}: ChartLegendControlsProps) {
  const visible = new Set(visibleSeries);

  const sortedSeries = [...series].sort((a, b) => {
    if (sortMode === "value") {
      return (b.latestValue ?? Number.NEGATIVE_INFINITY) - (a.latestValue ?? Number.NEGATIVE_INFINITY);
    }
    return a.label.localeCompare(b.label);
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-stellar-border bg-stellar-dark/30 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        className={`flex flex-wrap ${compact ? "gap-1.5" : "gap-2"}`}
        aria-label="Chart series visibility"
      >
        {sortedSeries.map((item) => {
          const active = visible.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onToggleSeries(item.id)}
              aria-pressed={active}
              aria-label={`${active ? "Hide" : "Show"} ${item.label} series`}
              className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                active
                  ? "border-stellar-border text-stellar-text-primary"
                  : "border-stellar-border/60 text-stellar-text-secondary opacity-60"
              }`}
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden="true"
              />
              <span>{item.label}</span>
              {!compact && item.latestValue !== undefined ? (
                <span className="text-stellar-text-secondary">
                  {valueFormatter(item.latestValue)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-xs text-stellar-text-secondary">
        <span>Sort</span>
        <select
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as LegendSortMode)}
          className="min-h-9 rounded-md border border-stellar-border bg-stellar-card px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          aria-label="Sort chart legend"
        >
          <option value="name">Name</option>
          <option value="value">Latest value</option>
        </select>
      </label>
    </div>
  );
}
