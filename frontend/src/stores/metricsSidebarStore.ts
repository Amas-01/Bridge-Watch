import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface PinnedMetric {
  id: string;
  label: string;
  category: "bridge" | "asset" | "network";
  metricKey: string;
  entityId?: string;
  order: number;
}

interface MetricsSidebarState {
  pinned: PinnedMetric[];
  isOpen: boolean;
  isCollapsed: boolean;
  collapsedIds: string[];
  pinMetric: (metric: Omit<PinnedMetric, "order">) => void;
  unpinMetric: (id: string) => void;
  reorderMetrics: (orderedIds: string[]) => void;
  toggleOpen: () => void;
  toggleCollapse: () => void;
  toggleWidgetCollapse: (id: string) => void;
  setOpen: (open: boolean) => void;
}

export const useMetricsSidebarStore = create<MetricsSidebarState>()(
  persist(
    (set) => ({
      pinned: [],
      isOpen: false,
      isCollapsed: false,
      collapsedIds: [],

      pinMetric(metric) {
        set((s) => {
          if (s.pinned.find((p) => p.id === metric.id)) return s;
          return {
            pinned: [...s.pinned, { ...metric, order: s.pinned.length }],
          };
        });
      },

      unpinMetric(id) {
        set((s) => ({
          pinned: s.pinned
            .filter((p) => p.id !== id)
            .map((p, i) => ({ ...p, order: i })),
          collapsedIds: s.collapsedIds.filter((c) => c !== id),
        }));
      },

      reorderMetrics(orderedIds) {
        set((s) => {
          const map = new Map(s.pinned.map((p) => [p.id, p]));
          const reordered = orderedIds
            .map((id, i) => {
              const m = map.get(id);
              return m ? { ...m, order: i } : null;
            })
            .filter((m): m is PinnedMetric => m !== null);
          return { pinned: reordered };
        });
      },

      toggleOpen() {
        set((s) => ({ isOpen: !s.isOpen }));
      },

      toggleCollapse() {
        set((s) => ({ isCollapsed: !s.isCollapsed }));
      },

      toggleWidgetCollapse(id) {
        set((s) => ({
          collapsedIds: s.collapsedIds.includes(id)
            ? s.collapsedIds.filter((c) => c !== id)
            : [...s.collapsedIds, id],
        }));
      },

      setOpen(open) {
        set({ isOpen: open });
      },
    }),
    {
      name: "bridge-watch:metrics-sidebar",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export const AVAILABLE_METRICS: Omit<PinnedMetric, "order">[] = [
  { id: "net-health-avg", label: "Avg Network Health", category: "network", metricKey: "avgHealthScore" },
  { id: "net-bridges-total", label: "Total Bridges", category: "network", metricKey: "bridgeCount" },
  { id: "net-tvl-total", label: "Total TVL", category: "network", metricKey: "totalTvl" },
  { id: "net-healthy-bridges", label: "Healthy Bridges", category: "network", metricKey: "healthyBridges" },
  { id: "net-alerts-active", label: "Active Alerts", category: "network", metricKey: "activeAlerts" },
  { id: "net-assets-tracked", label: "Assets Tracked", category: "network", metricKey: "assetCount" },
  { id: "bridge-uptime", label: "Bridge Uptime %", category: "bridge", metricKey: "uptime30d" },
  { id: "bridge-mismatch", label: "Bridge Mismatch %", category: "bridge", metricKey: "mismatchPct" },
  { id: "bridge-vol-24h", label: "Bridge Vol 24h", category: "bridge", metricKey: "volume24h" },
  { id: "asset-health-score", label: "Asset Health Score", category: "asset", metricKey: "healthScore" },
  { id: "asset-price-dev", label: "Price Deviation", category: "asset", metricKey: "priceDeviation" },
  { id: "asset-liquidity", label: "Liquidity Depth", category: "asset", metricKey: "liquidityDepth" },
];
