import { useEffect, useMemo, useState } from "react";
import type { DependencyGraph, DependencyNodeStatus, DependencyNodeType } from "../types";
import { getDependencyGraph } from "../services/api";
import TopologyMap from "../components/TopologyMap";


const TYPE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "All types", value: "all" },
  { label: "Bridge", value: "bridge" },
  { label: "Oracle", value: "oracle" },
  { label: "Indexer", value: "indexer" },
  { label: "RPC", value: "rpc" },
  { label: "Queue", value: "queue" },
  { label: "Database", value: "database" },
  { label: "Notifier", value: "notifier" },
  { label: "API", value: "api" },
];

const STATUS_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "All status", value: "all" },
  { label: "Healthy", value: "healthy" },
  { label: "Degraded", value: "degraded" },
  { label: "Down", value: "down" },
  { label: "Unknown", value: "unknown" },
];

function statusBadgeClass(status: DependencyNodeStatus): string {
  if (status === "healthy") {
    return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  }
  if (status === "degraded") {
    return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  }
  if (status === "down") {
    return "bg-red-500/20 text-red-300 border-red-500/30";
  }
  return "bg-slate-500/20 text-slate-300 border-slate-500/30";
}

function typePill(type: DependencyNodeType): string {
  return type.replace(/_/g, " ").toUpperCase();
}

export default function Dependencies() {
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "topology">("topology");

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);

    getDependencyGraph({
      type: typeFilter === "all" ? undefined : typeFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      search: search.trim() ? search.trim() : undefined,
    })
      .then((data) => {
        if (!mounted) return;
        setGraph(data);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "Failed to load dependency graph";
        setError(message);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [typeFilter, statusFilter, search]);

  const grouped = useMemo(() => {
    const buckets: Record<string, string[]> = {};
    if (!graph) {
      return buckets;
    }
    for (const edge of graph.edges) {
      if (!buckets[edge.from]) {
        buckets[edge.from] = [];
      }
      buckets[edge.from].push(`${edge.to} (${edge.kind})`);
    }
    return buckets;
  }, [graph]);

  return (
    <section className="space-y-6">
      <header className="rounded-xl border border-stellar-border bg-stellar-card p-5 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Service Dependency Graph</h1>
          <p className="mt-2 text-sm text-stellar-text-secondary">
            Visualize bridge system dependencies, status overlays, and operational impact.
          </p>
        </div>
        <div className="flex bg-stellar-dark p-1 rounded-lg border border-stellar-border">
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === "list" ? "bg-stellar-blue text-white" : "text-stellar-text-secondary hover:text-white"}`}
          >
            List
          </button>
          <button
            onClick={() => setViewMode("topology")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === "topology" ? "bg-stellar-blue text-white" : "text-stellar-text-secondary hover:text-white"}`}
          >
            Topology
          </button>
        </div>
      </header>

      <div className="grid gap-3 rounded-xl border border-stellar-border bg-stellar-card p-4 md:grid-cols-3">
        <label className="space-y-1 text-sm text-stellar-text-secondary">
          Service type
          <select
            className="w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm text-stellar-text-secondary">
          Service status
          <select
            className="w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm text-stellar-text-secondary">
          Search
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Bridge, RPC, queue..."
            className="w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white placeholder:text-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          />
        </label>
      </div>

      {loading && (
        <div className="rounded-xl border border-stellar-border bg-stellar-card p-6 text-stellar-text-secondary">
          Loading dependency graph...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && graph && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <article className="rounded-xl border border-stellar-border bg-stellar-card p-4">
              <p className="text-xs uppercase tracking-wide text-stellar-text-secondary">Services</p>
              <p className="mt-2 text-2xl font-semibold text-white">{graph.summary.totalNodes}</p>
            </article>
            <article className="rounded-xl border border-stellar-border bg-stellar-card p-4">
              <p className="text-xs uppercase tracking-wide text-stellar-text-secondary">Degraded</p>
              <p className="mt-2 text-2xl font-semibold text-amber-300">{graph.summary.degradedServices}</p>
            </article>
            <article className="rounded-xl border border-stellar-border bg-stellar-card p-4">
              <p className="text-xs uppercase tracking-wide text-stellar-text-secondary">Down</p>
              <p className="mt-2 text-2xl font-semibold text-red-300">{graph.summary.downServices}</p>
            </article>
          </div>

          {viewMode === "topology" ? (
            <TopologyMap graph={graph} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {graph.nodes.map((node) => (
                <article
                  key={node.id}
                  tabIndex={0}
                  aria-label={`${node.label} dependency node`}
                  className="rounded-xl border border-stellar-border bg-stellar-card p-4 outline-none transition focus:ring-2 focus:ring-stellar-blue"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{node.label}</h2>
                      <p className="mt-1 text-sm text-stellar-text-secondary">{node.description}</p>
                    </div>
                    <span className="rounded-md border border-stellar-border bg-stellar-dark px-2 py-1 text-[11px] text-stellar-text-secondary">
                      {typePill(node.type)}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusBadgeClass(node.status)}`}>
                      {node.status}
                    </span>
                    <span className="text-xs text-stellar-text-secondary">
                      Outgoing deps: {grouped[node.id]?.length ?? 0}
                    </span>
                  </div>

                  <p className="mt-3 rounded-md bg-stellar-dark px-3 py-2 text-sm text-stellar-text-secondary">
                    Impact: {node.impactHint}
                  </p>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
