import { useEffect, useState, type FormEvent } from "react";
import {
  getAssetLifecycleStats,
  getAssetLifecycleTimeline,
  recordAssetLifecycleTransition,
} from "../services/api";
import type {
  AssetLifecycleRecord,
  AssetLifecycleStats,
  AssetState,
} from "../types";

const ALL_STATES: AssetState[] = [
  "INITIALIZED",
  "PROVISIONED",
  "ACTIVE",
  "PAUSED",
  "DEPRECATED",
  "RETIRED",
];

export default function AssetLifecycleTimeline() {
  const [records, setRecords] = useState<AssetLifecycleRecord[]>([]);
  const [stats, setStats] = useState<AssetLifecycleStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterState, setFilterState] = useState<string>("");
  const [filterAssetId, setFilterAssetId] = useState<string>("");

  const [form, setForm] = useState({
    assetId: "USDC:GA5ZSEJYB37JRC5AVCIA5XYF4DZ62C2Z54MICLX4KCH7RE4P7MCE47C3",
    assetSymbol: "USDC",
    state: "ACTIVE" as AssetState,
    previousState: "PROVISIONED" as AssetState,
    reason: "State transition passed compliance & security audit.",
    triggeredBy: "operator-admin",
  });

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resRecords, resStats] = await Promise.all([
        getAssetLifecycleTimeline(filterAssetId || undefined, filterState || undefined),
        getAssetLifecycleStats(),
      ]);
      setRecords(resRecords.records);
      setStats(resStats.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterState, filterAssetId]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await recordAssetLifecycleTransition({
        assetId: form.assetId,
        assetSymbol: form.assetSymbol,
        state: form.state,
        previousState: form.previousState,
        reason: form.reason,
        triggeredBy: form.triggeredBy,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "State transition failed");
    } finally {
      setLoading(false);
    }
  };

  const getStateColor = (state: AssetState) => {
    switch (state) {
      case "ACTIVE":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
      case "PROVISIONED":
      case "INITIALIZED":
        return "bg-blue-500/15 text-blue-300 border-blue-500/30";
      case "PAUSED":
        return "bg-amber-500/15 text-amber-300 border-amber-500/30";
      case "DEPRECATED":
      case "RETIRED":
        return "bg-rose-500/15 text-rose-300 border-rose-500/30";
      default:
        return "bg-gray-500/15 text-gray-300 border-gray-500/30";
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Asset Management</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Asset Lifecycle State Timeline</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Audit trail of asset lifecycle transitions, state progression, authorization details, and operational status.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Total Transitions</p>
            <p className="mt-2 text-3xl font-semibold text-white">{stats?.totalTransitions ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
            <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Active Assets</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-400">{stats?.activeAssets ?? 0}</p>
          </div>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr,2fr]">
        <form onSubmit={handleSubmit} className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-white">Record State Transition</h2>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Asset Identifier</span>
            <input
              type="text"
              value={form.assetId}
              onChange={(e) => setForm({ ...form, assetId: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Asset Symbol</span>
            <input
              type="text"
              value={form.assetSymbol}
              onChange={(e) => setForm({ ...form, assetSymbol: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm text-stellar-text-secondary">New State</span>
              <select
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value as AssetState })}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
              >
                {ALL_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-stellar-text-secondary">Previous State</span>
              <select
                value={form.previousState}
                onChange={(e) => setForm({ ...form, previousState: e.target.value as AssetState })}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
              >
                {ALL_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Justification / Reason</span>
            <textarea
              rows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-stellar-text-secondary">Triggered By</span>
            <input
              type="text"
              value={form.triggeredBy}
              onChange={(e) => setForm({ ...form, triggeredBy: e.target.value })}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-2.5 text-white outline-none focus:border-stellar-blue"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-stellar-blue px-5 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? "Recording..." : "Record Transition"}
          </button>
        </form>

        <div className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Timeline Log</h2>
            <div className="flex gap-3">
              <select
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                className="rounded-2xl border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white outline-none"
              >
                <option value="">All States</option>
                {ALL_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Filter by asset ID"
                value={filterAssetId}
                onChange={(e) => setFilterAssetId(e.target.value)}
                className="rounded-2xl border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white outline-none"
              />
            </div>
          </div>

          <div className="space-y-4">
            {records.length === 0 && (
              <p className="py-8 text-center text-sm text-stellar-text-secondary">
                No timeline records match current filters.
              </p>
            )}

            {records.map((r) => (
              <article
                key={r.id}
                className="rounded-2xl border border-stellar-border bg-stellar-dark/60 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-white text-lg">{r.assetSymbol}</span>
                    <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${getStateColor(r.state)}`}>
                      {r.state}
                    </span>
                    {r.previousState && (
                      <span className="text-xs text-stellar-text-secondary">
                        (from {r.previousState})
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-stellar-text-secondary">
                    {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>

                {r.reason && <p className="text-sm text-gray-300">{r.reason}</p>}

                <div className="flex items-center justify-between text-xs text-stellar-text-secondary">
                  <span>Triggered by: {r.triggeredBy}</span>
                  <span className="font-mono text-[10px] opacity-60">ID: {r.id.slice(0, 8)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
