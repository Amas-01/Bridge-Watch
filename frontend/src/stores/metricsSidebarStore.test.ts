import { describe, it, expect, beforeEach } from "vitest";
import { useMetricsSidebarStore, type PinnedMetric } from "./metricsSidebarStore";

function resetStoreState() {
  const initialState = useMetricsSidebarStore.getInitialState();
  useMetricsSidebarStore.setState(initialState, true);
  localStorage.clear();
}

const sampleMetric: Omit<PinnedMetric, "order"> = {
  id: "net-tvl-total",
  label: "Total TVL",
  category: "network",
  metricKey: "totalTvl",
};

describe("metricsSidebarStore", () => {
  beforeEach(() => {
    resetStoreState();
  });

  it("initializes with default state", () => {
    const state = useMetricsSidebarStore.getState();

    expect(state.pinned).toEqual([]);
    expect(state.isOpen).toBe(false);
    expect(state.isCollapsed).toBe(false);
    expect(state.collapsedIds).toEqual([]);
  });

  describe("pinMetric", () => {
    it("pins a metric with an assigned order", () => {
      useMetricsSidebarStore.getState().pinMetric(sampleMetric);

      const { pinned } = useMetricsSidebarStore.getState();
      expect(pinned).toHaveLength(1);
      expect(pinned[0]).toEqual({ ...sampleMetric, order: 0 });
    });

    it("assigns incrementing order values", () => {
      const store = useMetricsSidebarStore.getState();
      store.pinMetric(sampleMetric);
      store.pinMetric({ id: "net-bridges-total", label: "Total Bridges", category: "network", metricKey: "bridgeCount" });

      const { pinned } = useMetricsSidebarStore.getState();
      expect(pinned.map((p) => p.order)).toEqual([0, 1]);
    });

    it("does not pin a metric that is already pinned", () => {
      const store = useMetricsSidebarStore.getState();
      store.pinMetric(sampleMetric);
      store.pinMetric(sampleMetric);

      expect(useMetricsSidebarStore.getState().pinned).toHaveLength(1);
    });
  });

  describe("unpinMetric", () => {
    it("removes a pinned metric and re-indexes order", () => {
      const store = useMetricsSidebarStore.getState();
      store.pinMetric({ id: "a", label: "A", category: "network", metricKey: "a" });
      store.pinMetric({ id: "b", label: "B", category: "network", metricKey: "b" });
      store.pinMetric({ id: "c", label: "C", category: "network", metricKey: "c" });

      useMetricsSidebarStore.getState().unpinMetric("b");

      const { pinned } = useMetricsSidebarStore.getState();
      expect(pinned.map((p) => p.id)).toEqual(["a", "c"]);
      expect(pinned.map((p) => p.order)).toEqual([0, 1]);
    });

    it("clears any collapsed state for the removed metric", () => {
      const store = useMetricsSidebarStore.getState();
      store.pinMetric(sampleMetric);
      store.toggleWidgetCollapse(sampleMetric.id);
      expect(useMetricsSidebarStore.getState().collapsedIds).toContain(sampleMetric.id);

      useMetricsSidebarStore.getState().unpinMetric(sampleMetric.id);

      expect(useMetricsSidebarStore.getState().collapsedIds).not.toContain(sampleMetric.id);
    });
  });

  describe("reorderMetrics", () => {
    it("reorders pinned metrics by the provided id list", () => {
      const store = useMetricsSidebarStore.getState();
      store.pinMetric({ id: "a", label: "A", category: "network", metricKey: "a" });
      store.pinMetric({ id: "b", label: "B", category: "network", metricKey: "b" });
      store.pinMetric({ id: "c", label: "C", category: "network", metricKey: "c" });

      useMetricsSidebarStore.getState().reorderMetrics(["c", "a", "b"]);

      const { pinned } = useMetricsSidebarStore.getState();
      expect(pinned.map((p) => p.id)).toEqual(["c", "a", "b"]);
      expect(pinned.map((p) => p.order)).toEqual([0, 1, 2]);
    });

    it("ignores ids that are not currently pinned", () => {
      const store = useMetricsSidebarStore.getState();
      store.pinMetric({ id: "a", label: "A", category: "network", metricKey: "a" });

      useMetricsSidebarStore.getState().reorderMetrics(["a", "missing"]);

      expect(useMetricsSidebarStore.getState().pinned.map((p) => p.id)).toEqual(["a"]);
    });
  });

  describe("open / collapse actions", () => {
    it("toggles the open state", () => {
      useMetricsSidebarStore.getState().toggleOpen();
      expect(useMetricsSidebarStore.getState().isOpen).toBe(true);

      useMetricsSidebarStore.getState().toggleOpen();
      expect(useMetricsSidebarStore.getState().isOpen).toBe(false);
    });

    it("sets the open state explicitly", () => {
      useMetricsSidebarStore.getState().setOpen(true);
      expect(useMetricsSidebarStore.getState().isOpen).toBe(true);

      useMetricsSidebarStore.getState().setOpen(false);
      expect(useMetricsSidebarStore.getState().isOpen).toBe(false);
    });

    it("toggles the whole-sidebar collapsed state", () => {
      useMetricsSidebarStore.getState().toggleCollapse();
      expect(useMetricsSidebarStore.getState().isCollapsed).toBe(true);

      useMetricsSidebarStore.getState().toggleCollapse();
      expect(useMetricsSidebarStore.getState().isCollapsed).toBe(false);
    });
  });

  describe("toggleWidgetCollapse", () => {
    it("collapses a widget by adding its id", () => {
      useMetricsSidebarStore.getState().toggleWidgetCollapse("net-tvl-total");

      expect(useMetricsSidebarStore.getState().collapsedIds).toEqual(["net-tvl-total"]);
    });

    it("expands a collapsed widget by removing its id", () => {
      const store = useMetricsSidebarStore.getState();
      store.toggleWidgetCollapse("net-tvl-total");
      store.toggleWidgetCollapse("net-tvl-total");

      expect(useMetricsSidebarStore.getState().collapsedIds).toEqual([]);
    });

    it("tracks multiple collapsed widgets independently", () => {
      const store = useMetricsSidebarStore.getState();
      store.toggleWidgetCollapse("a");
      store.toggleWidgetCollapse("b");
      expect(useMetricsSidebarStore.getState().collapsedIds).toEqual(["a", "b"]);

      useMetricsSidebarStore.getState().toggleWidgetCollapse("a");
      expect(useMetricsSidebarStore.getState().collapsedIds).toEqual(["b"]);
    });
  });
});
