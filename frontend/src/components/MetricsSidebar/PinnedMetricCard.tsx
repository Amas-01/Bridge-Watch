import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PinnedMetric } from "../../stores/metricsSidebarStore";

interface MetricValue {
  value: string | number | null;
  trend?: "up" | "down" | "flat";
  unit?: string;
}

interface Props {
  metric: PinnedMetric;
  liveValue?: MetricValue;
  onUnpin: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: (id: string) => void;
}

function trendArrow(trend?: "up" | "down" | "flat") {
  if (trend === "up") return <span className="text-green-400 text-xs">↑</span>;
  if (trend === "down") return <span className="text-red-400 text-xs">↓</span>;
  return null;
}

export default function PinnedMetricCard({
  metric,
  liveValue,
  onUnpin,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: metric.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const val = liveValue?.value;
  const displayVal = val !== null && val !== undefined ? String(val) : "—";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-2 rounded-lg border border-stellar-border bg-stellar-dark p-3 group select-none ${
        isDragging ? "shadow-xl ring-1 ring-stellar-blue/50" : ""
      }`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="flex-shrink-0 mt-0.5 cursor-grab active:cursor-grabbing text-stellar-text-muted hover:text-stellar-text-secondary p-0.5 rounded transition-colors focus:outline-none"
        {...attributes}
        {...listeners}
        aria-label={`Drag to reorder ${metric.label}`}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <circle cx="7" cy="6" r="1.5" />
          <circle cx="13" cy="6" r="1.5" />
          <circle cx="7" cy="10" r="1.5" />
          <circle cx="13" cy="10" r="1.5" />
          <circle cx="7" cy="14" r="1.5" />
          <circle cx="13" cy="14" r="1.5" />
        </svg>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-stellar-text-secondary truncate">{metric.label}</p>
        {!collapsed && (
          <>
            <div className="flex items-baseline gap-1 mt-0.5">
              <p className="text-base font-semibold text-white truncate">
                {displayVal}
              </p>
              {liveValue?.unit && (
                <span className="text-xs text-stellar-text-muted">{liveValue.unit}</span>
              )}
              {trendArrow(liveValue?.trend)}
            </div>
            <p className="text-xs text-stellar-text-muted capitalize mt-0.5">{metric.category}</p>
          </>
        )}
      </div>

      {/* Collapse / expand */}
      {onToggleCollapse && (
        <button
          type="button"
          onClick={() => onToggleCollapse(metric.id)}
          className="flex-shrink-0 text-stellar-text-muted hover:text-white transition-colors rounded p-0.5 focus:outline-none"
          aria-label={`${collapsed ? "Expand" : "Collapse"} ${metric.label}`}
          aria-expanded={!collapsed}
          title={collapsed ? "Expand" : "Collapse"}
        >
          <svg
            className={`w-3.5 h-3.5 transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Unpin */}
      <button
        type="button"
        onClick={() => onUnpin(metric.id)}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus:opacity-100 text-stellar-text-muted hover:text-red-400 transition-all rounded p-0.5 focus:outline-none"
        aria-label={`Unpin ${metric.label}`}
        title="Unpin"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
