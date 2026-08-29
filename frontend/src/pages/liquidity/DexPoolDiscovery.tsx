import { useCallback, useEffect, useState } from "react";
import { liquidityApi, usd } from "./api";

/**
 * DEX Pool Discovery Refresh (#1157).
 *
 * Shows the pool registry alongside the refresh history, because the two only
 * make sense together: a spike of delistings usually means a broken adapter,
 * not five pools closing at once.
 */

interface DiscoveryRun {
  id: string;
  dex: string;
  status: "running" | "completed" | "failed";
  poolsSeen: number;
  poolsAdded: number;
  poolsUpdated: number;
  poolsDelisted: number;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
}

interface RegisteredPool {
  id: string;
  dex: string;
  poolKey: string;
  assetA: string;
  assetB: string;
  totalLiquidity: number;
  status: "active" | "delisted";
  firstSeenAt: string;
  lastSeenAt: string;
  delistedAt: string | null;
}

const DEXES = ["StellarX", "Phoenix", "LumenSwap", "Soroswap", "SDEX"];

const RUN_STATUS_STYLE: Record<DiscoveryRun["status"], string> = {
  completed: "bg-emerald-500/15 text-emerald-300",
  running: "bg-sky-500/15 text-sky-300",
  failed: "bg-red-500/15 text-red-300",
};

export default function DexPoolDiscovery() {
  const [dexFilter, setDexFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "delisted">("");
  const [pools, setPools] = useState<RegisteredPool[]>([]);
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (dexFilter) params.set("dex", dexFilter);
      if (statusFilter) params.set("status", statusFilter);

      const [poolData, runData] = await Promise.all([
        liquidityApi<{ pools: RegisteredPool[] }>(`/pool-discovery/pools?${params}`),
        liquidityApi<{ runs: DiscoveryRun[] }>(
          `/pool-discovery/runs?${dexFilter ? `dex=${dexFilter}` : ""}`
        ),
      ]);
      setPools(poolData.pools);
      setRuns(runData.runs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load discovery data");
    } finally {
      setLoading(false);
    }
  }, [dexFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const runRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await liquidityApi("/pool-discovery/refresh", {
        method: "POST",
        body: JSON.stringify({ dexes: dexFilter ? [dexFilter] : DEXES }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const activeCount = pools.filter((p) => p.status === "active").length;

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">DEX Pool Discovery</h1>
          <p className="text-sm text-slate-400">
            {activeCount} active of {pools.length} registered pools
          </p>
        </div>
        <button
          onClick={runRefresh}
          disabled={refreshing}
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : `Refresh ${dexFilter || "all DEXes"}`}
        </button>
      </header>

      <div className="flex flex-wrap gap-3">
        <select
          value={dexFilter}
          onChange={(e) => setDexFilter(e.target.value)}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">All DEXes</option>
          {DEXES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="delisted">Delisted</option>
        </select>
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <section>
        <h2 className="mb-2 text-lg font-medium">Recent refreshes</h2>
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-left text-slate-400">
              <tr>
                <th className="px-3 py-2">DEX</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Seen</th>
                <th className="px-3 py-2">Added</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2">Delisted</th>
                <th className="px-3 py-2">Started</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-slate-800">
                  <td className="px-3 py-2">{run.dex}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${RUN_STATUS_STYLE[run.status]}`}
                      title={run.errorMessage ?? undefined}
                    >
                      {run.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{run.poolsSeen}</td>
                  <td className="px-3 py-2 text-emerald-300">+{run.poolsAdded}</td>
                  <td className="px-3 py-2">{run.poolsUpdated}</td>
                  <td className="px-3 py-2 text-amber-300">{run.poolsDelisted}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {new Date(run.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {runs.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    No refresh has run yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">Pool registry</h2>
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-left text-slate-400">
              <tr>
                <th className="px-3 py-2">Pool</th>
                <th className="px-3 py-2">DEX</th>
                <th className="px-3 py-2">Pair</th>
                <th className="px-3 py-2">Liquidity</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">First seen</th>
                <th className="px-3 py-2">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {pools.map((pool) => (
                <tr key={pool.id} className="border-t border-slate-800">
                  <td className="px-3 py-2 font-mono text-xs">{pool.poolKey}</td>
                  <td className="px-3 py-2">{pool.dex}</td>
                  <td className="px-3 py-2">
                    {pool.assetA}/{pool.assetB}
                  </td>
                  <td className="px-3 py-2">{usd(pool.totalLiquidity)}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        pool.status === "active"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-slate-600/30 text-slate-400"
                      }`}
                    >
                      {pool.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {new Date(pool.firstSeenAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-slate-400">
                    {new Date(pool.lastSeenAt).toLocaleString()}
                  </td>
                </tr>
              ))}
              {pools.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                    No pools registered. Run a refresh to populate the registry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
