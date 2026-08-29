import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { FilterStatus } from "../types";
import { useLocalStorageState } from "./useLocalStorageState";

export type DashboardTimeRangePreset = "all" | "24h" | "7d" | "30d";

export interface DashboardFilters {
  assets: string[];
  bridges: string[];
  status: FilterStatus;
  timeRange: DashboardTimeRangePreset;
}

export interface DashboardFilterPreset {
  id: string;
  name: string;
  filters: DashboardFilters;
  /** Whether the preset is shared (exposes a shareable link) or kept private. */
  shared: boolean;
  createdAt: number;
  updatedAt: number;
}

const FILTER_PRESET_STORAGE_KEY = "bridge-watch:dashboard-filter-presets:v1";
const VALID_STATUSES: FilterStatus[] = ["all", "healthy", "warning", "critical"];
const VALID_TIME_RANGES: DashboardTimeRangePreset[] = ["all", "24h", "7d", "30d"];

export const DEFAULT_DASHBOARD_FILTERS: DashboardFilters = {
  assets: [],
  bridges: [],
  status: "all",
  timeRange: "all",
};

function normalizeList(value: string | null): string[] {
  if (!value) return [];

  const cleaned = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return Array.from(new Set(cleaned)).sort((a, b) => a.localeCompare(b));
}

export function parseDashboardFilters(params: URLSearchParams): DashboardFilters {
  const rawStatus = params.get("status");
  const rawTimeRange = params.get("range");

  const status = VALID_STATUSES.includes(rawStatus as FilterStatus)
    ? (rawStatus as FilterStatus)
    : DEFAULT_DASHBOARD_FILTERS.status;

  const timeRange = VALID_TIME_RANGES.includes(rawTimeRange as DashboardTimeRangePreset)
    ? (rawTimeRange as DashboardTimeRangePreset)
    : DEFAULT_DASHBOARD_FILTERS.timeRange;

  return {
    assets: normalizeList(params.get("assets")),
    bridges: normalizeList(params.get("bridges")),
    status,
    timeRange,
  };
}

export function buildDashboardSearchParams(filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams();

  if (filters.assets.length > 0) {
    params.set("assets", Array.from(new Set(filters.assets)).sort((a, b) => a.localeCompare(b)).join(","));
  }

  if (filters.bridges.length > 0) {
    params.set("bridges", Array.from(new Set(filters.bridges)).sort((a, b) => a.localeCompare(b)).join(","));
  }

  if (filters.status !== DEFAULT_DASHBOARD_FILTERS.status) {
    params.set("status", filters.status);
  }

  if (filters.timeRange !== DEFAULT_DASHBOARD_FILTERS.timeRange) {
    params.set("range", filters.timeRange);
  }

  return params;
}

export function isDashboardFilterActive(filters: DashboardFilters): boolean {
  return (
    filters.assets.length > 0 ||
    filters.bridges.length > 0 ||
    filters.status !== "all" ||
    filters.timeRange !== "all"
  );
}

export function isTimestampInRange(
  timestamp: string | null | undefined,
  timeRange: DashboardTimeRangePreset,
  now = new Date(),
): boolean {
  if (timeRange === "all") return true;
  if (!timestamp) return false;

  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) return false;

  const msByRange: Record<Exclude<DashboardTimeRangePreset, "all">, number> = {
    "24h": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
  };

  const cutoff = now.getTime() - msByRange[timeRange];
  return value.getTime() >= cutoff;
}

function normalizePreset(preset: Partial<DashboardFilterPreset> & { id: string; name: string; filters: DashboardFilters }): DashboardFilterPreset {
  const now = Date.now();
  return {
    id: preset.id,
    name: preset.name,
    filters: preset.filters,
    shared: preset.shared ?? false,
    createdAt: preset.createdAt ?? now,
    updatedAt: preset.updatedAt ?? preset.createdAt ?? now,
  };
}

/**
 * Build an absolute, shareable URL that re-applies a preset's filters when opened.
 * Filters are encoded as URL search params, matching the dashboard's URL-persisted state.
 */
export function buildPresetShareUrl(preset: DashboardFilterPreset, pathname = "/dashboard"): string {
  const params = buildDashboardSearchParams(preset.filters);
  const query = params.toString();
  const origin =
    typeof window === "undefined" || !window.location?.origin
      ? "https://bridge-watch.local"
      : window.location.origin;
  return `${origin}${pathname}${query ? `?${query}` : ""}`;
}

function toggleSelection(values: string[], candidate: string): string[] {
  if (values.includes(candidate)) {
    return values.filter((value) => value !== candidate);
  }

  return [...values, candidate].sort((a, b) => a.localeCompare(b));
}

export function useDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [storedPresets, setSavedPresets] = useLocalStorageState<DashboardFilterPreset[]>(
    FILTER_PRESET_STORAGE_KEY,
    [],
  );

  const savedPresets = useMemo(
    () => storedPresets.map((preset) => normalizePreset(preset)),
    [storedPresets],
  );

  const filters = useMemo(() => parseDashboardFilters(searchParams), [searchParams]);

  const setFilters = useCallback(
    (nextFilters: DashboardFilters) => {
      const nextParams = new URLSearchParams(searchParams);
      const filterParams = buildDashboardSearchParams(nextFilters);

      ["assets", "bridges", "status", "range"].forEach((key) => nextParams.delete(key));
      filterParams.forEach((value, key) => {
        nextParams.set(key, value);
      });

      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const updateFilters = useCallback(
    (updates: Partial<DashboardFilters>) => {
      setFilters({ ...filters, ...updates });
    },
    [filters, setFilters],
  );

  const toggleAsset = useCallback(
    (asset: string) => {
      updateFilters({ assets: toggleSelection(filters.assets, asset) });
    },
    [filters.assets, updateFilters],
  );

  const toggleBridge = useCallback(
    (bridge: string) => {
      updateFilters({ bridges: toggleSelection(filters.bridges, bridge) });
    },
    [filters.bridges, updateFilters],
  );

  const setStatus = useCallback(
    (status: FilterStatus) => {
      updateFilters({ status });
    },
    [updateFilters],
  );

  const setTimeRange = useCallback(
    (timeRange: DashboardTimeRangePreset) => {
      updateFilters({ timeRange });
    },
    [updateFilters],
  );

  const clearAll = useCallback(() => {
    setFilters(DEFAULT_DASHBOARD_FILTERS);
  }, [setFilters]);

  const savePreset = useCallback(
    (name: string): boolean => {
      const presetName = name.trim();
      if (!presetName) return false;

      const now = Date.now();
      const nextPreset: DashboardFilterPreset = {
        id: `preset-${now}-${Math.random().toString(36).slice(2, 8)}`,
        name: presetName,
        filters,
        shared: false,
        createdAt: now,
        updatedAt: now,
      };

      setSavedPresets((prev) => {
        const remaining = prev.filter((preset) => preset.name.toLowerCase() !== presetName.toLowerCase());
        return [...remaining, nextPreset];
      });

      return true;
    },
    [filters, setSavedPresets],
  );

  const renamePreset = useCallback(
    (presetId: string, name: string): boolean => {
      const nextName = name.trim();
      if (!nextName) return false;

      let renamed = false;
      setSavedPresets((prev) => {
        const clash = prev.some(
          (preset) => preset.id !== presetId && preset.name.toLowerCase() === nextName.toLowerCase(),
        );
        if (clash) return prev;

        return prev.map((preset) => {
          if (preset.id !== presetId) return preset;
          renamed = true;
          return normalizePreset({ ...preset, name: nextName, updatedAt: Date.now() });
        });
      });

      return renamed;
    },
    [setSavedPresets],
  );

  const setPresetShared = useCallback(
    (presetId: string, shared: boolean) => {
      setSavedPresets((prev) =>
        prev.map((preset) =>
          preset.id === presetId
            ? normalizePreset({ ...preset, shared, updatedAt: Date.now() })
            : preset,
        ),
      );
    },
    [setSavedPresets],
  );

  const applyPreset = useCallback(
    (presetId: string): boolean => {
      const preset = savedPresets.find((entry) => entry.id === presetId);
      if (!preset) return false;
      setFilters(preset.filters);
      return true;
    },
    [savedPresets, setFilters],
  );

  const deletePreset = useCallback(
    (presetId: string) => {
      setSavedPresets((prev) => prev.filter((preset) => preset.id !== presetId));
    },
    [setSavedPresets],
  );

  return {
    filters,
    savedPresets,
    hasActiveFilters: isDashboardFilterActive(filters),
    toggleAsset,
    toggleBridge,
    setStatus,
    setTimeRange,
    clearAll,
    savePreset,
    applyPreset,
    renamePreset,
    setPresetShared,
    deletePreset,
  };
}
