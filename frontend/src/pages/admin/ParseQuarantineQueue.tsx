import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  disposeQuarantineRecord,
  enqueueQuarantineRecord,
  getQuarantineStats,
  listQuarantineRecords,
  resolveQuarantineRecord,
  retryQuarantineRecord,
} from "../../services/api";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { QuarantineRecord, QuarantineStats, QuarantineStatus } from "../../types";

const STATUS_STYLES: Record<QuarantineStatus, string> = {
  quarantined: "bg-yellow-500/15 text-yellow-300",
  in_review: "bg-blue-500/15 text-blue-300",
  resolved: "bg-emerald-500/15 text-emerald-300",
  disposed: "bg-red-500/15 text-red-300",
  failed: "bg-orange-500/15 text-orange-300",
};

const DEFAULT_FORM = {
  source: "",
  dataType: "",
  rawPayload: '{"symbol": "USDC", "name": "USD Coin"}',
  parseError: "",
  errorCode: "",
  priority: 5,
};

export default function ParseQuarantineQueue() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );
  const [records, setRecords] = useState<QuarantineRecord[]>([]);
  const [stats, setStats] = useState<QuarantineStats | null>(null);
  const [statusFilter, setStatusFilter] = useState<QuarantineStatus | "">("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  const load = async () => {
    if (!adminToken) {
      setRecords([]);
      setStats(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [recordsRes, statsRes] = await Promise.all([
        listQuarantineRecords(adminToken, { status: statusFilter || undefined, limit: 100 }),
        getQuarantineStats(adminToken),
      ]);
      setRecords(recordsRes.records);
      setStats(statsRes.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quarantine queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken, statusFilter]);

  const handleEnqueue = async (event: FormEvent) => {
    event.preventDefault();
    if (!adminToken) {
      setError("Enter an admin API key first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(form.rawPayload) as Record<string, unknown>;
      } catch {
        throw new Error("Raw payload must be valid JSON");
      }
      await enqueueQuarantineRecord(adminToken, {
        source: form.source,
        dataType: form.dataType,
        rawPayload: payload,
        parseError: form.parseError,
        errorCode: form.errorCode || undefined,
        priority: form.priority,
      });
      setForm(DEFAULT_FORM);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enqueue record");
    } finally {
      setLoading(false);
    }
  };

  const act = async (id: string, action: "resolve" | "dispose" | "retry") => {
    if (!adminToken) return;
    setError(null);
    try {
      if (action === "resolve") await resolveQuarantineRecord(adminToken, id);
      else if (action === "dispose") await disposeQuarantineRecord(adminToken, id);
      else await retryQuarantineRecord(adminToken, id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  };

  const statEntries = useMemo(
    () => (stats ? Object.entries(stats.byStatus) : []),
    [stats]
  );

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Failed parse quarantine</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Review, retry, resolve, or dispose records that failed to parse on
            ingestion so data quality issues are handled explicitly instead of lost.
          </p>
        </div>
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">In queue</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats?.total ?? 0}</p>
        </div>
      </header>

      {!adminToken && (
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 p-6">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Admin or bootstrap token</span>
            <input
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Paste your admin API key"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {stats && statEntries.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {statEntries.map(([status, count]) => (
            <div key={status} className="rounded-2xl border border-stellar-border bg-stellar-card/80 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">{status}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{count}</p>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Queue</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {(["", "quarantined", "in_review", "resolved", "disposed", "failed"] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    statusFilter === status
                      ? "border-stellar-blue bg-stellar-blue/10 text-white"
                      : "border-stellar-border bg-stellar-dark text-stellar-text-secondary hover:border-stellar-blue"
                  }`}
                >
                  {status === "" ? "All" : status}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
          >
            Refresh
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {records.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
              {adminToken ? "No quarantine records." : "Add an admin token to load the queue."}
            </div>
          )}
          {records.map((record) => (
            <article key={record.id} className="rounded-2xl border border-stellar-border bg-stellar-dark/70 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-medium text-white">{record.source}</h3>
                    <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${STATUS_STYLES[record.status] ?? "bg-stellar-border/40 text-stellar-text-secondary"}`}>
                      {record.status}
                    </span>
                    <span className="rounded-full border border-stellar-border px-3 py-1 text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
                      {record.dataType}
                    </span>
                    <span className="rounded-full border border-stellar-border px-3 py-1 text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
                      priority {record.priority}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-red-300">{record.parseError}</p>
                  {record.errorCode && (
                    <p className="mt-1 text-xs text-stellar-text-secondary">code: {record.errorCode}</p>
                  )}
                  <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-stellar-border bg-stellar-dark p-3 text-xs text-stellar-text-secondary">
                    {JSON.stringify(record.rawPayload, null, 2)}
                  </pre>
                  <p className="mt-2 text-xs text-stellar-text-secondary">
                    Retries: {record.retryCount} · quarantined {new Date(record.quarantinedAt).toLocaleString()}
                    {record.resolutionNote && <> · note: {record.resolutionNote}</>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {record.status === "quarantined" && (
                    <button type="button" onClick={() => void act(record.id, "retry")} className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white">
                      Retry
                    </button>
                  )}
                  {(record.status === "quarantined" || record.status === "in_review") && (
                    <>
                      <button type="button" onClick={() => void act(record.id, "resolve")} className="rounded-full border border-emerald-500/40 px-4 py-2 text-sm text-emerald-300 transition hover:bg-emerald-500/10">
                        Resolve
                      </button>
                      <button type="button" onClick={() => void act(record.id, "dispose")} className="rounded-full border border-red-500/40 px-4 py-2 text-sm text-red-300 transition hover:bg-red-500/10">
                        Dispose
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="text-xl font-semibold text-white">Enqueue a failed-parse record</h2>
        <p className="mt-1 text-sm text-stellar-text-secondary">
          Simulate an ingestion failure to verify the quarantine flow end to end.
        </p>
        <form onSubmit={handleEnqueue} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Source</span>
              <input
                type="text"
                value={form.source}
                onChange={(event) => setForm((c) => ({ ...c, source: event.target.value }))}
                placeholder="some-exchange"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Data type</span>
              <input
                type="text"
                value={form.dataType}
                onChange={(event) => setForm((c) => ({ ...c, dataType: event.target.value }))}
                placeholder="asset"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Priority</span>
              <input
                type="number"
                min={1}
                max={10}
                value={form.priority}
                onChange={(event) => setForm((c) => ({ ...c, priority: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Raw payload (JSON)</span>
            <textarea
              value={form.rawPayload}
              onChange={(event) => setForm((c) => ({ ...c, rawPayload: event.target.value }))}
              rows={3}
              spellCheck={false}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Parse error</span>
            <input
              type="text"
              value={form.parseError}
              onChange={(event) => setForm((c) => ({ ...c, parseError: event.target.value }))}
              placeholder="Unexpected field 'foo'"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Error code</span>
            <input
              type="text"
              value={form.errorCode}
              onChange={(event) => setForm((c) => ({ ...c, errorCode: event.target.value }))}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Enqueuing..." : "Enqueue record"}
          </button>
        </form>
      </section>
    </div>
  );
}
