import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useMetricsSidebarStore } from "../../stores/metricsSidebarStore";
import PinnedMetricCard from "./PinnedMetricCard";
import { useBridges } from "../../hooks/useBridges";
import { useAssetsWithHealth } from "../../hooks/useAssets";

function useLiveMetricValues() {
  const { data: bridgesData } = useBridges({ refetchInterval: 30_000 });
  const { data: assetsData } = useAssetsWithHealth({ refetchInterval: 30_000 });

  const bridges = bridgesData?.bridges ?? [];
  const assets = assetsData ?? [];

  const healthyBridges = bridges.filter((b) => b.status === "healthy").length;
  const avgHealthScore =
    assets.length > 0
      ? Math.round(
          assets.reduce((sum, a) => sum + (a.health?.overallScore ?? 0), 0) / assets.length
        )
      : null;

  const totalTvl = bridges.reduce((sum, b) => sum + b.totalValueLocked, 0);
  const avgMismatch =
    bridges.length > 0
      ? (bridges.reduce((sum, b) => sum + b.mismatchPercentage, 0) / bridges.length).toFixed(2)
      : null;

  return {
    "net-health-avg": {
      value: avgHealthScore,
      unit: "",
      trend:
        avgHealthScore !== null
          ? avgHealthScore >= 75
            ? ("up" as const)
            : ("down" as const)
          : undefined,
    },
    "net-bridges-total": { value: bridges.length, unit: "" },
    "net-tvl-total": {
      value: totalTvl > 0 ? `$${(totalTvl / 1_000_000).toFixed(1)}M` : "—",
      unit: "",
    },
    "net-healthy-bridges": { value: healthyBridges, unit: "" },
    "net-alerts-active": { value: null, unit: "" },
    "net-assets-tracked": { value: assets.length, unit: "" },
    "bridge-mismatch": { value: avgMismatch, unit: "%" },
    "bridge-uptime": { value: null, unit: "%" },
    "bridge-vol-24h": { value: null, unit: "" },
    "asset-health-score": { value: avgHealthScore, unit: "" },
    "asset-price-dev": { value: null, unit: "" },
    "asset-liquidity": { value: null, unit: "" },
  } as Record<string, { value: string | number | null; unit?: string; trend?: "up" | "down" | "flat" }>;
}

export default function MetricsSidebar() {
  const { pinned, isCollapsed, collapsedIds, unpinMetric, reorderMetrics, toggleCollapse, toggleWidgetCollapse } =
    useMetricsSidebarStore();

  const liveValues = useLiveMetricValues();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = pinned.findIndex((p) => p.id === active.id);
    const newIndex = pinned.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(pinned, oldIndex, newIndex);
    reorderMetrics(reordered.map((p) => p.id));
  }

  if (pinned.length === 0) return null;

  const sortedPinned = [...pinned].sort((a, b) => a.order - b.order);

  return (
    <aside
      className={`fixed right-0 top-16 bottom-0 z-30 flex flex-col border-l border-stellar-border bg-stellar-card transition-all duration-300 shadow-2xl ${
        isCollapsed ? "w-10" : "w-64"
      }`}
      aria-label="Pinned metrics sidebar"
    >
      {/* Toggle collapse */}
      <button
        type="button"
        onClick={toggleCollapse}
        className="flex items-center justify-center h-10 border-b border-stellar-border text-stellar-text-secondary hover:text-white transition-colors focus:outline-none"
        aria-label={isCollapsed ? "Expand metrics sidebar" : "Collapse metrics sidebar"}
        title={isCollapsed ? "Expand" : "Collapse"}
      >
        <svg
          className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-stellar-text-secondary px-1 pb-1">
            Pinned Metrics
          </p>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedPinned.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {sortedPinned.map((metric) => (
                <PinnedMetricCard
                  key={metric.id}
                  metric={metric}
                  liveValue={liveValues[metric.id]}
                  onUnpin={unpinMetric}
                  collapsed={collapsedIds.includes(metric.id)}
                  onToggleCollapse={toggleWidgetCollapse}
                />
              ))}
            </SortableContext>
          </DndContext>

          <p className="text-xs text-stellar-text-muted text-center pt-2">
            Drag to reorder · Visit{" "}
            <a href="/metrics-sidebar" className="text-stellar-blue hover:underline">
              Metrics
            </a>{" "}
            to manage
          </p>
        </div>
      )}

      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center gap-3 pt-3">
          {sortedPinned.slice(0, 5).map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-stellar-blue/60" />
          ))}
          {sortedPinned.length > 5 && (
            <p className="text-xs text-stellar-text-muted">+{sortedPinned.length - 5}</p>
          )}
        </div>
      )}
    </aside>
  );
}
