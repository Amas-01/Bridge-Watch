import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFreshnessSnapshot,
  getFreshnessSource,
  getFreshnessSourceTrend,
  getFreshnessAlerts,
  type FreshnessSourceStatus,
  type FreshnessAlert,
} from "../services/api";

type QueryRefreshOptions = {
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
};

// Stable references for the empty states so the memoized composite result
// keeps the same identity while data is still loading.
const EMPTY_SOURCES: FreshnessSourceStatus[] = [];
const EMPTY_ALERTS: FreshnessAlert[] = [];

export function useFreshnessSnapshot(options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["freshness"],
    queryFn: () => getFreshnessSnapshot(),
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}

export function useFreshnessSource(source: string, options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["freshness-source", source],
    queryFn: () => getFreshnessSource(source),
    enabled: !!source,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}

export function useFreshnessSourceTrend(source: string, options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["freshness-trend", source],
    queryFn: () => getFreshnessSourceTrend(source),
    enabled: !!source,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}

export function useFreshnessAlerts() {
  return useQuery({
    queryKey: ["freshness-alerts"],
    queryFn: getFreshnessAlerts,
  });
}

export interface UseFreshnessResult {
  sources: FreshnessSourceStatus[];
  staleSources: number;
  freshSources: number;
  alerts: FreshnessAlert[];
  criticalSourceKeys: Set<string>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Composite freshness hook that combines the snapshot and alerts queries into a
 * single, referentially-stable view for consumer components.
 *
 * Every derived value is memoized and the `refetch` callback is stabilized with
 * `useCallback`, so the returned object keeps the same identity across renders
 * unless the underlying query data actually changes. This prevents the infinite
 * re-render loops that occur when a consumer places the hook's result in a
 * `useEffect`/`useMemo` dependency array or forwards it into another hook.
 */
export function useFreshness(options?: QueryRefreshOptions): UseFreshnessResult {
  const snapshot = useFreshnessSnapshot(options);
  const alertsQuery = useFreshnessAlerts();

  const snapshotRefetch = snapshot.refetch;
  const alertsRefetch = alertsQuery.refetch;

  const refetch = useCallback(async () => {
    await Promise.all([snapshotRefetch(), alertsRefetch()]);
  }, [snapshotRefetch, alertsRefetch]);

  const sources = snapshot.data?.sources ?? EMPTY_SOURCES;
  const alerts = alertsQuery.data?.alerts ?? EMPTY_ALERTS;
  const staleSources = snapshot.data?.staleSources ?? 0;
  const freshSources = snapshot.data?.freshSources ?? 0;
  const isLoading = snapshot.isLoading;

  const criticalSourceKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const alert of alerts) {
      if (alert.severity === "critical") {
        keys.add(alert.source);
      }
    }
    return keys;
  }, [alerts]);

  return useMemo(
    () => ({
      sources,
      staleSources,
      freshSources,
      alerts,
      criticalSourceKeys,
      isLoading,
      refetch,
    }),
    [sources, staleSources, freshSources, alerts, criticalSourceKeys, isLoading, refetch]
  );
}
