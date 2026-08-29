import { useState } from "react";
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
import {
  useMetricsSidebarStore,
  AVAILABLE_METRICS,
} from "../stores/metricsSidebarStore";
import PinnedMetricCard from "../components/MetricsSidebar/PinnedMetricCard";
import MetricsLibrary from "../components/MetricsSidebar/MetricsLibrary";

type Category = "all" | "network" | "bridge" | "asset";

export default function MetricsSidebarPage() {
  const {
    pinned,
    isOpen,
    pinMetric,
    unpinMetric,
    reorderMetrics,
    setOpen,
  } = useMetricsSidebarStore();

  const [libraryCategory, setLibraryCategory] = useState<Category>("all");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sortedPinned = [...pinned].sort((a, b) => a.order - b.order);
    const oldIndex = sortedPinned.findIndex((p) => p.id === active.id);
    const newIndex = sortedPinned.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(sortedPinned, oldIndex, newIndex);
    reorderMetrics(reordered.map((p) => p.id));
  }

  const sortedPinned = [...pinned].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Metrics Sidebar</h1>
          <p className="mt-2 text-stellar-text-secondary">
            Pin metrics to a persistent sidebar so they stay visible while you browse the dashboard.
            Drag to reorder pinned metrics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(!isOpen)}
          className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
            isOpen
              ? "border border-stellar-border text-stellar-text-secondary hover:text-white"
              : "bg-stellar-blue text-white hover:bg-stellar-blue/90"
          }`}
          aria-pressed={isOpen}
        >
          {isOpen ? "Hide Sidebar" : "Show Sidebar"}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pinned metrics */}
        <section className="bg-stellar-card border border-stellar-border rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">
              Pinned Metrics
              {pinned.length > 0 && (
                <span className="ml-2 text-sm font-normal text-stellar-text-secondary">
                  ({pinned.length})
                </span>
              )}
            </h2>
            {pinned.length > 0 && (
              <button
                type="button"
                onClick={() => pinned.forEach((p) => unpinMetric(p.id))}
                className="text-xs text-stellar-text-secondary hover:text-red-400 transition-colors"
              >
                Unpin all
              </button>
            )}
          </div>

          {sortedPinned.length === 0 ? (
            <div className="rounded-lg border border-stellar-border border-dashed p-8 text-center">
              <svg
                className="w-10 h-10 mx-auto mb-3 text-stellar-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
                />
              </svg>
              <p className="text-white font-medium">No metrics pinned</p>
              <p className="text-stellar-text-secondary text-sm mt-1">
                Choose metrics from the library on the right.
              </p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={sortedPinned.map((p) => p.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {sortedPinned.map((metric) => (
                    <PinnedMetricCard
                      key={metric.id}
                      metric={metric}
                      onUnpin={unpinMetric}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {sortedPinned.length > 0 && (
            <p className="mt-3 text-xs text-stellar-text-muted text-center">
              Drag cards to reorder · hover to unpin
            </p>
          )}
        </section>

        {/* Metrics library */}
        <section className="bg-stellar-card border border-stellar-border rounded-lg p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Metrics Library</h2>
          <MetricsLibrary
            pinned={pinned}
            onPin={pinMetric}
            onUnpin={unpinMetric}
            category={libraryCategory}
            onCategoryChange={setLibraryCategory}
          />
        </section>
      </div>

      {/* Sidebar behaviour info */}
      <section className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Sidebar Behaviour</h2>
        <div className="grid sm:grid-cols-3 gap-4 text-sm text-stellar-text-secondary">
          {[
            {
              title: "Persistent",
              body: "Pinned metrics stay visible in the sidebar as you navigate between pages.",
            },
            {
              title: "Collapsible",
              body: "Use the collapse button on the sidebar to hide it when you need more screen space.",
            },
            {
              title: "Mobile",
              body: "On small screens the sidebar is hidden by default. Toggle via the Show Sidebar button.",
            },
          ].map((item) => (
            <div key={item.title} className="flex gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <span className="w-5 h-5 rounded-full bg-stellar-blue/20 text-stellar-blue flex items-center justify-center text-xs font-bold">
                  ✓
                </span>
              </div>
              <div>
                <p className="text-white font-medium">{item.title}</p>
                <p className="mt-0.5">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick-pin from available list */}
      <section className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-1">All Available Metrics</h2>
        <p className="text-sm text-stellar-text-secondary mb-4">
          {AVAILABLE_METRICS.length} metrics available across network, bridge, and asset categories.
        </p>
        <div className="flex flex-wrap gap-2">
          {AVAILABLE_METRICS.map((m) => {
            const isPinned = pinned.some((p) => p.id === m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => (isPinned ? unpinMetric(m.id) : pinMetric(m))}
                aria-pressed={isPinned}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                  isPinned
                    ? "bg-stellar-blue text-white"
                    : "border border-stellar-border text-stellar-text-secondary hover:text-white hover:border-stellar-blue/50"
                }`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
