import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDependencyGraph } from "../services/api";
import type { DependencyGraph, DependencyNodeStatus } from "../types";

const STATUS_COLORS: Record<DependencyNodeStatus, string> = {
  healthy: "#22c55e",
  degraded: "#f59e0b",
  down: "#ef4444",
  unknown: "#6b7280",
};

const STATUS_BADGE: Record<DependencyNodeStatus, string> = {
  healthy: "bg-green-500/20 text-green-400 border border-green-500/30",
  degraded: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  down: "bg-red-500/20 text-red-400 border border-red-500/30",
  unknown: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
};

type FilterStatus = DependencyNodeStatus | "all";
type FilterType = string;

interface LayoutNode {
  id: string;
  label: string;
  description: string;
  type: string;
  status: DependencyNodeStatus;
  impactHint: string;
  x: number;
  y: number;
}

const GRAPH_W = 800;
const GRAPH_H = 500;
const NODE_R = 24;

function layoutNodes(nodes: DependencyGraph["nodes"]): LayoutNode[] {
  if (nodes.length === 0) return [];

  const byType = new Map<string, typeof nodes>();
  for (const n of nodes) {
    if (!byType.has(n.type)) byType.set(n.type, []);
    byType.get(n.type)!.push(n);
  }

  const cols = Array.from(byType.entries());
  const colW = GRAPH_W / (cols.length + 1);

  const laid: LayoutNode[] = [];
  cols.forEach(([, group], ci) => {
    const rowH = GRAPH_H / (group.length + 1);
    group.forEach((n, ri) => {
      laid.push({
        ...n,
        x: colW * (ci + 1),
        y: rowH * (ri + 1),
      });
    });
  });

  return laid;
}

function GraphNode({
  node,
  selected,
  dimmed,
  onClick,
}: {
  node: LayoutNode;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  const color = STATUS_COLORS[node.status] ?? STATUS_COLORS.unknown;
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      className="cursor-pointer"
      onClick={onClick}
      role="button"
      aria-label={`${node.label} (${node.status})`}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{ opacity: dimmed ? 0.3 : 1 }}
    >
      <circle
        r={NODE_R + 4}
        fill="transparent"
        stroke={selected ? color : "transparent"}
        strokeWidth={2}
        className="transition-all"
      />
      <circle
        r={NODE_R}
        fill="#1e293b"
        stroke={color}
        strokeWidth={selected ? 2.5 : 1.5}
        className="transition-all"
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={10}
        fill="#e2e8f0"
        className="select-none pointer-events-none"
        style={{ fontWeight: selected ? 700 : 400 }}
      >
        {node.label.length > 7 ? node.label.slice(0, 6) + "…" : node.label}
      </text>
      <text
        y={NODE_R + 12}
        textAnchor="middle"
        fontSize={8}
        fill="#94a3b8"
        className="select-none pointer-events-none"
      >
        {node.type}
      </text>
    </g>
  );
}

function EdgeLine({
  from,
  to,
  kind,
  highlight,
}: {
  from: LayoutNode;
  to: LayoutNode;
  kind: string;
  highlight: boolean;
}) {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        stroke={highlight ? "#60a5fa" : "#334155"}
        strokeWidth={highlight ? 2 : 1}
        strokeDasharray={kind === "optional" ? "4 4" : undefined}
        markerEnd="url(#arrow)"
        className="transition-all"
      />
      {highlight && (
        <text
          x={mx}
          y={my - 6}
          textAnchor="middle"
          fontSize={8}
          fill="#60a5fa"
          className="select-none pointer-events-none"
        >
          {kind}
        </text>
      )}
    </g>
  );
}

export default function RelationshipExplorer() {
  const { data, isLoading, error } = useQuery<DependencyGraph, Error>({
    queryKey: ["dependencyGraph"],
    queryFn: () => getDependencyGraph(),
    staleTime: 60_000,
  });

  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodeTypes = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.nodes.map((n) => n.type))).sort();
  }, [data]);

  const filteredNodes = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.nodes.filter((n) => {
      if (filterStatus !== "all" && n.status !== filterStatus) return false;
      if (filterType !== "all" && n.type !== filterType) return false;
      if (q && !n.label.toLowerCase().includes(q) && !n.description.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [data, query, filterStatus, filterType]);

  const filteredIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const laidOut = useMemo(() => layoutNodes(data?.nodes ?? []), [data]);
  const laidOutMap = useMemo(
    () => new Map(laidOut.map((n) => [n.id, n])),
    [laidOut],
  );

  const visibleEdges = useMemo(() => {
    if (!data) return [];
    return data.edges.filter(
      (e) => filteredIds.has(e.from) && filteredIds.has(e.to),
    );
  }, [data, filteredIds]);

  const selectedNode = selectedId ? laidOutMap.get(selectedId) : null;
  const connectedIds = useMemo(() => {
    if (!selectedId || !data) return new Set<string>();
    const ids = new Set<string>();
    for (const e of data.edges) {
      if (e.from === selectedId) ids.add(e.to);
      if (e.to === selectedId) ids.add(e.from);
    }
    return ids;
  }, [selectedId, data]);

  const selectedEdges = useMemo(() => {
    if (!selectedId || !data) return [];
    return data.edges.filter((e) => e.from === selectedId || e.to === selectedId);
  }, [selectedId, data]);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary mb-1">
          Asset Relationship Explorer
        </h1>
        <p className="text-stellar-text-secondary text-sm">
          Visualize dependencies between assets, bridges, alerts, and services.
        </p>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="flex flex-wrap gap-4">
          {[
            { label: "Total nodes", value: data.summary.totalNodes },
            { label: "Degraded", value: data.summary.degradedServices, color: "text-yellow-400" },
            { label: "Down", value: data.summary.downServices, color: "text-red-400" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-lg border border-stellar-border bg-stellar-card px-4 py-3 min-w-[120px]"
            >
              <p className="text-xs text-stellar-text-secondary">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color ?? "text-stellar-text-primary"}`}>
                {s.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stellar-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Search nodes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-lg border border-stellar-border bg-stellar-dark pl-9 pr-3 py-1.5 text-sm text-stellar-text-primary placeholder-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue w-52"
          />
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
          className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          <option value="all">All statuses</option>
          <option value="healthy">Healthy</option>
          <option value="degraded">Degraded</option>
          <option value="down">Down</option>
          <option value="unknown">Unknown</option>
        </select>

        {nodeTypes.length > 0 && (
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          >
            <option value="all">All types</option>
            {nodeTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}

        {selectedId && (
          <button
            type="button"
            onClick={() => setSelectedId(null)}
            className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-secondary hover:text-white transition-colors"
          >
            Clear selection
          </button>
        )}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Graph canvas */}
        <div className="flex-1 rounded-xl border border-stellar-border bg-stellar-card overflow-hidden relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center text-stellar-text-secondary text-sm">
              Loading graph…
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm p-4 text-center">
              {error.message}
            </div>
          )}
          {!isLoading && !error && data && (
            <svg
              viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
              className="w-full h-full"
              aria-label="Dependency relationship graph"
            >
              <defs>
                <marker
                  id="arrow"
                  markerWidth="8"
                  markerHeight="8"
                  refX="6"
                  refY="3"
                  orient="auto"
                >
                  <path d="M0,0 L0,6 L8,3 z" fill="#475569" />
                </marker>
              </defs>

              {/* Edges */}
              {visibleEdges.map((e, i) => {
                const from = laidOutMap.get(e.from);
                const to = laidOutMap.get(e.to);
                if (!from || !to) return null;
                const hl =
                  selectedId === e.from ||
                  selectedId === e.to;
                return (
                  <EdgeLine key={i} from={from} to={to} kind={e.kind} highlight={hl} />
                );
              })}

              {/* Nodes */}
              {laidOut
                .filter((n) => filteredIds.has(n.id))
                .map((n) => (
                  <GraphNode
                    key={n.id}
                    node={n}
                    selected={selectedId === n.id}
                    dimmed={
                      selectedId !== null &&
                      selectedId !== n.id &&
                      !connectedIds.has(n.id)
                    }
                    onClick={() => setSelectedId(selectedId === n.id ? null : n.id)}
                  />
                ))}
            </svg>
          )}
          {!isLoading && !error && data && data.nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-stellar-text-secondary text-sm">
              No dependency data available.
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <aside
            className="w-72 shrink-0 rounded-xl border border-stellar-border bg-stellar-card p-5 space-y-4 overflow-y-auto"
            aria-label="Node detail panel"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold text-stellar-text-primary leading-tight">
                {selectedNode.label}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0 ${STATUS_BADGE[selectedNode.status]}`}
              >
                {selectedNode.status}
              </span>
            </div>

            <div className="text-xs text-stellar-text-secondary space-y-1">
              <p>
                <span className="text-stellar-text-primary font-medium">Type: </span>
                {selectedNode.type}
              </p>
              <p>
                <span className="text-stellar-text-primary font-medium">ID: </span>
                <span className="font-mono">{selectedNode.id}</span>
              </p>
            </div>

            {selectedNode.description && (
              <p className="text-sm text-stellar-text-secondary">{selectedNode.description}</p>
            )}

            {selectedNode.impactHint && (
              <div className="rounded-lg border border-stellar-border bg-stellar-dark p-3">
                <p className="text-xs font-medium text-stellar-text-primary mb-1">Impact</p>
                <p className="text-xs text-stellar-text-secondary">{selectedNode.impactHint}</p>
              </div>
            )}

            {selectedEdges.length > 0 && (
              <div>
                <p className="text-xs font-medium text-stellar-text-primary mb-2">
                  Connections ({selectedEdges.length})
                </p>
                <ul className="space-y-1.5">
                  {selectedEdges.map((e, i) => {
                    const otherId = e.from === selectedNode.id ? e.to : e.from;
                    const other = laidOutMap.get(otherId);
                    const direction = e.from === selectedNode.id ? "→" : "←";
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(otherId)}
                          className="w-full text-left rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-xs hover:bg-stellar-border/40 transition-colors flex items-center justify-between gap-2"
                        >
                          <span className="flex items-center gap-1 truncate">
                            <span className="text-stellar-text-secondary">{direction}</span>
                            <span className="text-stellar-text-primary truncate">
                              {other?.label ?? otherId}
                            </span>
                          </span>
                          <span className="text-stellar-text-secondary shrink-0">{e.kind}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Node list (responsive fallback / accessibility) */}
      <details className="rounded-xl border border-stellar-border bg-stellar-card">
        <summary className="px-5 py-3 text-sm font-medium text-stellar-text-primary cursor-pointer select-none">
          Node list ({filteredNodes.length})
        </summary>
        <div className="px-5 pb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stellar-border text-left">
                <th className="py-2 pr-4 text-xs text-stellar-text-secondary font-medium">Label</th>
                <th className="py-2 pr-4 text-xs text-stellar-text-secondary font-medium">Type</th>
                <th className="py-2 pr-4 text-xs text-stellar-text-secondary font-medium">Status</th>
                <th className="py-2 text-xs text-stellar-text-secondary font-medium">Impact</th>
              </tr>
            </thead>
            <tbody>
              {filteredNodes.map((n) => (
                <tr
                  key={n.id}
                  className={`border-b border-stellar-border/40 cursor-pointer hover:bg-stellar-dark/50 transition-colors ${
                    selectedId === n.id ? "bg-stellar-blue/10" : ""
                  }`}
                  onClick={() => setSelectedId(selectedId === n.id ? null : n.id)}
                >
                  <td className="py-2 pr-4 text-stellar-text-primary font-medium">{n.label}</td>
                  <td className="py-2 pr-4 text-stellar-text-secondary">{n.type}</td>
                  <td className="py-2 pr-4">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[n.status]}`}>
                      {n.status}
                    </span>
                  </td>
                  <td className="py-2 text-stellar-text-secondary text-xs">{n.impactHint}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
