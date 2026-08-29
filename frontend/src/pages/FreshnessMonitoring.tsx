import { useMemo, useState } from "react";
import { useRefreshControls, type RefreshTarget } from "../hooks/useRefreshControls";
import { useFreshness } from "../hooks/useFreshness";
import RefreshControls from "../components/RefreshControls";
import { SkeletonCard } from "../components/Skeleton";

type StatusFilter = "all" | "fresh" | "stale" | "critical";

function StatusBadge({ status }: { status: "fresh" | "stale" | "unknown" }) {
  if (status === "fresh") {
    return (
      <span className="inline-flex items-center rounded-full bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-400">
        Fresh
      </span>
    );
  }
  if (status === "stale") {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-400">
        Stale
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-stellar-border px-2.5 py-0.5 text-xs font-medium text-stellar-text-secondary">
      Unknown
    </span>
  );
}

function TrendIcon({ trend }: { trend?: string | null }) {
  if (trend === "improving") return <span className="text-green-400" aria-label="Improving">↑</span>;
  if (trend === "degrading") return <span className="text-amber-400" aria-label="Degrading">↓</span>;
  return <span className="text-stellar-text-secondary" aria-label="Stable">→</span>;
}

function formatAge(lastUpdated: string | null): string {
  if (!lastUpdated) return "—";
  const ms = Date.now() - new Date(lastUpdated).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function FreshnessMonitoring() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Memoized so useRefreshControls receives a stable array identity across
  // renders instead of a fresh literal each time.
  const refreshTargets = useMemo<RefreshTarget[]>(
    () => [{ id: "freshness", label: "Freshness data", queryKey: ["freshness"] }],
    []
  );

  const refreshControls = useRefreshControls({
    viewId: "freshness",
    targets: refreshTargets,
    defaultIntervalMs: 30_000,
  });

  const { sources, staleSources: staleCount, freshSources: freshCount, alerts, criticalSourceKeys, isLoading, refetch } =
    useFreshness({
      refetchInterval: refreshControls.preferences.autoRefreshEnabled
        ? refreshControls.preferences.refreshIntervalMs
        : false,
      refetchOnWindowFocus: refreshControls.preferences.refreshOnFocus,
    });

  const controlTargets = useMemo<RefreshTarget[]>(
    () => [{ id: "freshness", label: "Freshness data", refetch }],
    [refetch]
  );

  const filteredSources = useMemo(() => {
    if (statusFilter === "all") return sources;

    return sources.filter((source) => {
      if (statusFilter === "fresh") return source.status === "fresh";
      if (statusFilter === "stale") return source.status === "stale";
      if (statusFilter === "critical") return criticalSourceKeys.has(source.key);
      return false;
    });
  }, [criticalSourceKeys, sources, statusFilter]);

  const filterOptions: Array<{ id: StatusFilter; label: string }> = [
    { id: "all", label: "All" },
    { id: "fresh", label: "Fresh" },
    { id: "stale", label: "Stale" },
    { id: "critical", label: "Critical" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary">Data Freshness</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Monitor how recently each data source was updated and identify stale entries.
        </p>
      </div>

      <RefreshControls
        autoRefreshEnabled={refreshControls.preferences.autoRefreshEnabled}
        onAutoRefreshEnabledChange={refreshControls.setAutoRefreshEnabled}
        refreshIntervalMs={refreshControls.preferences.refreshIntervalMs}
        onRefreshIntervalChange={refreshControls.setRefreshIntervalMs}
        refreshOnFocus={refreshControls.preferences.refreshOnFocus}
        onRefreshOnFocusChange={refreshControls.setRefreshOnFocus}
        targets={controlTargets}
        selectedTargetIds={refreshControls.preferences.selectedTargetIds}
        onSelectedTargetIdsChange={refreshControls.setSelectedTargetIds}
        onRefresh={refreshControls.refreshNow}
        onCancelRefresh={refreshControls.cancelRefresh}
        isRefreshing={refreshControls.isRefreshing}
        lastUpdatedAt={refreshControls.lastUpdatedAt}
      />

      {!isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <p className="text-sm text-stellar-text-secondary">Total Sources</p>
            <p className="mt-1 text-2xl font-semibold text-stellar-text-primary">
              {sources.length}
            </p>
          </div>
          <div className="rounded-lg border border-green-800/40 bg-green-900/10 p-4">
            <p className="text-sm text-stellar-text-secondary">Fresh</p>
            <p className="mt-1 text-2xl font-semibold text-green-400">{freshCount}</p>
          </div>
          <div className="rounded-lg border border-amber-800/40 bg-amber-900/10 p-4">
            <p className="text-sm text-stellar-text-secondary">Stale</p>
            <p className="mt-1 text-2xl font-semibold text-amber-400">{staleCount}</p>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-900/10 p-4">
          <h2 className="text-sm font-semibold text-amber-400 mb-2">
            Freshness Alerts ({alerts.length})
          </h2>
          <ul className="space-y-1">
            {alerts.map((alert, i) => (
              <li key={i} className="text-sm text-stellar-text-secondary">
                <span className="font-medium text-amber-300">[{alert.severity.toUpperCase()}]</span>{" "}
                {alert.label}: {alert.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-stellar-border bg-stellar-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stellar-border px-6 py-4">
          <h2 className="text-lg font-semibold text-stellar-text-primary">Source Freshness Status</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Freshness status filters">
            {filterOptions.map((option) => {
              const isActive = statusFilter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setStatusFilter(option.id)}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    isActive
                      ? "border-stellar-accent bg-stellar-accent/20 text-stellar-accent"
                      : "border-stellar-border bg-stellar-dark/40 text-stellar-text-secondary hover:border-stellar-accent/60 hover:text-stellar-text-primary"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} rows={2} ariaLabel={`Loading source ${i}`} />
            ))}
          </div>
        ) : sources.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-stellar-text-secondary">
              No freshness data available. Staleness detection will populate this page once monitoring
              is active.
            </p>
          </div>
        ) : filteredSources.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-stellar-text-secondary">No sources match the selected filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Data source freshness status</caption>
              <thead>
                <tr className="text-left text-stellar-text-secondary border-b border-stellar-border">
                  <th scope="col" className="px-6 py-3">Source</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3">Last Updated</th>
                  <th scope="col" className="px-6 py-3">Expected Interval</th>
                  <th scope="col" className="px-6 py-3">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border">
                {filteredSources.map((source) => (
                  <tr
                    key={source.key}
                    className={
                      source.status === "stale"
                        ? "bg-amber-900/10"
                        : "hover:bg-stellar-dark/40"
                    }
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-stellar-text-primary">{source.label}</div>
                      <div className="text-xs text-stellar-text-secondary">{source.key}</div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={source.status} />
                    </td>
                    <td className="px-6 py-4 text-stellar-text-secondary">
                      {formatAge(source.lastUpdated)}
                    </td>
                    <td className="px-6 py-4 text-stellar-text-secondary">
                      {source.expectedIntervalMs > 0
                        ? `${Math.round(source.expectedIntervalMs / 1000)}s`
                        : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <TrendIcon trend={source.trend} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
