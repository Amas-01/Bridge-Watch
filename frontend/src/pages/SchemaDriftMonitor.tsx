import { useState, useMemo } from "react";
import { useSchemaDrift } from "../hooks/useSchemaDrift";
import { SkeletonCard } from "../components/Skeleton";
import type { SchemaDriftIncident } from "../services/api";

type DriftType = SchemaDriftIncident["drift_type"] | "ALL";

const TIME_RANGES = [
  { label: "All time", hours: 0 },
  { label: "Last 1h", hours: 1 },
  { label: "Last 24h", hours: 24 },
  { label: "Last 7d", hours: 168 },
];

function SeverityBadge({ isBreaking }: { isBreaking: boolean }) {
  if (isBreaking) {
    return (
      <span className="inline-flex items-center rounded-full bg-red-900/30 px-2.5 py-0.5 text-xs font-medium text-red-400">
        Breaking
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-900/30 px-2.5 py-0.5 text-xs font-medium text-amber-400">
      Non-breaking
    </span>
  );
}

function DriftTypeBadge({ driftType }: { driftType: SchemaDriftIncident["drift_type"] }) {
  const styles: Record<SchemaDriftIncident["drift_type"], string> = {
    REMOVAL: "bg-red-900/20 text-red-300",
    TYPE_CHANGE: "bg-orange-900/20 text-orange-300",
    ADDITION: "bg-blue-900/20 text-blue-300",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-medium ${styles[driftType]}`}>
      {driftType}
    </span>
  );
}

function formatDetectedAt(ts: string): string {
  const ms = Date.now() - new Date(ts).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function SchemaDriftMonitor() {
  const { summary, recentIncidents, isLoading, error } = useSchemaDrift();

  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [timeRange, setTimeRange] = useState<number>(0);
  const [driftTypeFilter, setDriftTypeFilter] = useState<DriftType>("ALL");

  const sources = useMemo(() => {
    const names = Array.from(new Set(recentIncidents.map((i) => i.source_name)));
    return ["ALL", ...names];
  }, [recentIncidents]);

  const filtered = useMemo(() => {
    return recentIncidents.filter((incident) => {
      if (sourceFilter !== "ALL" && incident.source_name !== sourceFilter) return false;
      if (driftTypeFilter !== "ALL" && incident.drift_type !== driftTypeFilter) return false;
      if (timeRange > 0) {
        const cutoff = new Date(Date.now() - timeRange * 60 * 60 * 1000);
        if (new Date(incident.detected_at) < cutoff) return false;
      }
      return true;
    });
  }, [recentIncidents, sourceFilter, driftTypeFilter, timeRange]);

  const breakingCount = recentIncidents.filter((i) => i.is_breaking).length;
  const nonBreakingCount = recentIncidents.length - breakingCount;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary">Schema Drift Monitor</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Track schema changes across monitored data sources and identify breaking field-level drift.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <p className="text-sm text-stellar-text-secondary">Total Incidents</p>
            <p className="mt-1 text-2xl font-semibold text-stellar-text-primary">
              {recentIncidents.length}
            </p>
          </div>
          <div className="rounded-lg border border-red-800/40 bg-red-900/10 p-4">
            <p className="text-sm text-stellar-text-secondary">Breaking</p>
            <p className="mt-1 text-2xl font-semibold text-red-400">{breakingCount}</p>
          </div>
          <div className="rounded-lg border border-amber-800/40 bg-amber-900/10 p-4">
            <p className="text-sm text-stellar-text-secondary">Non-breaking</p>
            <p className="mt-1 text-2xl font-semibold text-amber-400">{nonBreakingCount}</p>
          </div>
        </div>
      )}

      {!isLoading && summary.length > 0 && (
        <div className="rounded-lg border border-stellar-border bg-stellar-card">
          <div className="px-6 py-4 border-b border-stellar-border">
            <h2 className="text-lg font-semibold text-stellar-text-primary">Source Summary</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Schema drift summary by source</caption>
              <thead>
                <tr className="text-left text-stellar-text-secondary border-b border-stellar-border">
                  <th scope="col" className="px-6 py-3">Source</th>
                  <th scope="col" className="px-6 py-3">Incident Count</th>
                  <th scope="col" className="px-6 py-3">Last Detected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border">
                {summary.map((row) => (
                  <tr key={row.source_name} className="hover:bg-stellar-dark/40">
                    <td className="px-6 py-3 font-medium text-stellar-text-primary">{row.source_name}</td>
                    <td className="px-6 py-3 text-stellar-text-secondary">{row.incident_count}</td>
                    <td className="px-6 py-3 text-stellar-text-secondary">
                      {row.last_detected ? formatDetectedAt(row.last_detected) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-stellar-border bg-stellar-card">
        <div className="px-6 py-4 border-b border-stellar-border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-stellar-text-primary">Recent Drift Events</h2>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label="Filter by source"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="rounded border border-stellar-border bg-stellar-dark px-2 py-1 text-xs text-stellar-text-secondary focus:outline-none focus:ring-1 focus:ring-stellar-blue"
              >
                {sources.map((s) => (
                  <option key={s} value={s}>{s === "ALL" ? "All sources" : s}</option>
                ))}
              </select>

              <select
                aria-label="Filter by drift type"
                value={driftTypeFilter}
                onChange={(e) => setDriftTypeFilter(e.target.value as DriftType)}
                className="rounded border border-stellar-border bg-stellar-dark px-2 py-1 text-xs text-stellar-text-secondary focus:outline-none focus:ring-1 focus:ring-stellar-blue"
              >
                <option value="ALL">All types</option>
                <option value="ADDITION">Addition</option>
                <option value="REMOVAL">Removal</option>
                <option value="TYPE_CHANGE">Type change</option>
              </select>

              <select
                aria-label="Filter by time range"
                value={timeRange}
                onChange={(e) => setTimeRange(Number(e.target.value))}
                className="rounded border border-stellar-border bg-stellar-dark px-2 py-1 text-xs text-stellar-text-secondary focus:outline-none focus:ring-1 focus:ring-stellar-blue"
              >
                {TIME_RANGES.map((r) => (
                  <option key={r.hours} value={r.hours}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} rows={2} ariaLabel={`Loading drift event ${i}`} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-stellar-text-secondary">
              No drift events found for the selected filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Recent schema drift incidents</caption>
              <thead>
                <tr className="text-left text-stellar-text-secondary border-b border-stellar-border">
                  <th scope="col" className="px-6 py-3">Source</th>
                  <th scope="col" className="px-6 py-3">Type</th>
                  <th scope="col" className="px-6 py-3">Field</th>
                  <th scope="col" className="px-6 py-3">Expected</th>
                  <th scope="col" className="px-6 py-3">Actual</th>
                  <th scope="col" className="px-6 py-3">Severity</th>
                  <th scope="col" className="px-6 py-3">Detected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border">
                {filtered.map((incident) => (
                  <tr
                    key={incident.id}
                    className={incident.is_breaking ? "bg-red-900/5 hover:bg-red-900/10" : "hover:bg-stellar-dark/40"}
                  >
                    <td className="px-6 py-3 font-medium text-stellar-text-primary">{incident.source_name}</td>
                    <td className="px-6 py-3"><DriftTypeBadge driftType={incident.drift_type} /></td>
                    <td className="px-6 py-3 font-mono text-xs text-stellar-text-secondary">{incident.field_path}</td>
                    <td className="px-6 py-3 text-stellar-text-secondary">{incident.expected_type ?? "—"}</td>
                    <td className="px-6 py-3 text-stellar-text-secondary">{incident.actual_type ?? "—"}</td>
                    <td className="px-6 py-3"><SeverityBadge isBreaking={incident.is_breaking} /></td>
                    <td className="px-6 py-3 text-stellar-text-secondary">{formatDetectedAt(incident.detected_at)}</td>
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
