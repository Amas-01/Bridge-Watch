import { AVAILABLE_METRICS } from "../../stores/metricsSidebarStore";
import type { PinnedMetric } from "../../stores/metricsSidebarStore";

type Category = "all" | "network" | "bridge" | "asset";

interface Props {
  pinned: PinnedMetric[];
  onPin: (metric: Omit<PinnedMetric, "order">) => void;
  onUnpin: (id: string) => void;
  category: Category;
  onCategoryChange: (c: Category) => void;
}

const CATEGORY_LABELS: { id: Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "network", label: "Network" },
  { id: "bridge", label: "Bridge" },
  { id: "asset", label: "Asset" },
];

export default function MetricsLibrary({
  pinned,
  onPin,
  onUnpin,
  category,
  onCategoryChange,
}: Props) {
  const pinnedIds = new Set(pinned.map((p) => p.id));

  const filtered = category === "all"
    ? AVAILABLE_METRICS
    : AVAILABLE_METRICS.filter((m) => m.category === category);

  return (
    <div className="space-y-3">
      {/* Category tabs */}
      <div className="flex gap-1 flex-wrap" role="group" aria-label="Filter by category">
        {CATEGORY_LABELS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onCategoryChange(c.id)}
            aria-pressed={category === c.id}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
              category === c.id
                ? "bg-stellar-blue text-white"
                : "border border-stellar-border text-stellar-text-secondary hover:text-white"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map((m) => {
          const isPinned = pinnedIds.has(m.id);
          return (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-stellar-border bg-stellar-dark px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{m.label}</p>
                <p className="text-xs text-stellar-text-muted capitalize">{m.category}</p>
              </div>
              <button
                type="button"
                onClick={() => (isPinned ? onUnpin(m.id) : onPin(m))}
                className={`ml-2 flex-shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                  isPinned
                    ? "border border-stellar-border text-stellar-text-secondary hover:text-red-400"
                    : "bg-stellar-blue/20 border border-stellar-blue/40 text-stellar-blue hover:bg-stellar-blue/30"
                }`}
                aria-label={isPinned ? `Unpin ${m.label}` : `Pin ${m.label}`}
              >
                {isPinned ? "Unpin" : "Pin"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
