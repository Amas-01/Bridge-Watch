import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProvenanceMetrics, getProvenanceLineage } from "../services/api";
import type {
  ProvenanceGraph,
  ProvenanceNode,
  ProvenanceNodeKind,
  ProvenanceFreshness,
  ProvenanceListItem,
} from "../types";

const KIND_COLORS: Record<ProvenanceNodeKind, string> = {
  source: "#818cf8",
  transform: "#f59e0b",
  destination: "#22c55e",
};

const KIND_LABEL: Record<ProvenanceNodeKind, string> = {
  source: "Source",
  transform: "Transform",
  destination: "Destination",
};

const FRESHNESS_BADGE: Record<ProvenanceFreshness, string> = {
  fresh: "bg-green-500/20 text-green-400 border border-green-500/30",
  stale: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
  unknown: "bg-gray-500/20 text-gray-400 border border-gray-500/30",
};

const GRAPH_W = 900;
const GRAPH_H = 480;
const NODE_R = 26;

interface LayoutNode extends ProvenanceNode {
  x: number;
  y: number;
}

function layoutNodes(nodes: ProvenanceNode[]): LayoutNode[] {
  if (nodes.length === 0) return [];

  const byKind = new Map<ProvenanceNodeKind, ProvenanceNode[]>([
    ["source", []],
    ["transform", []],
    ["destination", []],
  ]);

  for (const n of nodes) {
    byKind.get(n.kind)?.push(n);
  }

  const cols = (["source", "transform", "destination"] as ProvenanceNodeKind[]).filter(
    (k) => (byKind.get(k)?.length ?? 0) > 0
  );
  const colW = GRAPH_W / (cols.length + 1);

  const laid: LayoutNode[] = [];
  cols.forEach((kind, ci) => {
    const group = byKind.get(kind) ?? [];
    const rowH = GRAPH_H / (group.length + 1);
    group.forEach((n, ri) => {
      laid.push({ ...n, x: colW * (ci + 1), y: rowH * (ri + 1) });
    });
  });

  return laid;
}

function abbreviate(label: string, max = 8): string {
  return label.length > max ? label.slice(0, max - 1) + "…" : label;
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
  const color = KIND_COLORS[node.kind];
  return (
    <g
      transform={`translate(${node.x},${node.y})`}
      className="cursor-pointer"
      onClick={onClick}
      role="button"
      aria-label={`${node.label} (${node.kind}, ${node.freshness})`}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      style={{ opacity: dimmed ? 0.25 : 1, transition: "opacity 0.2s" }}
    >
      {/* Selection ring */}
      <circle
        r={NODE_R + 6}
        fill="transparent"
        stroke={selected ? color : "transparent"}
        strokeWidth={2}
      />
      {/* Node body */}
      <circle
        r={NODE_R}
        fill="#1e293b"
        stroke={color}
        strokeWidth={selected ? 2.5 : 1.5}
        style={{ transition: "stroke-width 0.15s" }}
      />
      {/* Freshness dot */}
      <circle
        r={5}
        cx={NODE_R - 4}
        cy={-(NODE_R - 4)}
        fill={
          node.freshness === "fresh"
            ? "#22c55e"
            : node.freshness === "stale"
            ? "#f59e0b"
            : "#6b7280"
        }
        stroke="#0f172a"
        strokeWidth={1.5}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9}
        fill="#e2e8f0"
        className="select-none pointer-events-none"
        style={{ fontWeight: selected ? 700 : 400 }}
      >
        {abbreviate(node.label)}
      </text>
      <text
        y={NODE_R + 13}
        textAnchor="middle"
        fontSize={8}
        fill="#94a3b8"
        className="select-none pointer-events-none"
      >
        {KIND_LABEL[node.kind]}
      </text>
    </g>
  );
}

function EdgeLine({
  from,
  to,
  transformKind,
  latencyMs,
  highlight,
}: {
  from: LayoutNode;
  to: LayoutNode;
  transformKind: string;
  latencyMs: number | null;
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
        markerEnd="url(#prov-arrow)"
        style={{ transition: "stroke 0.2s" }}
      />
      {highlight && (
        <>
          <text
            x={mx}
            y={my - 8}
            textAnchor="middle"
            fontSize={8}
            fill="#60a5fa"
            className="select-none pointer-events-none"
          >
            {transformKind}
          </text>
          {latencyMs !== null && (
            <text
              x={mx}
              y={my + 4}
              textAnchor="middle"
              fontSize={7}
              fill="#94a3b8"
              className="select-none pointer-events-none"
            >
              {latencyMs}ms
            </text>
          )}
        </>
      )}
    </g>
  );
}

function MetricPill({
  item,
  active,
  onClick,
}: {
  item: ProvenanceListItem;
  active: boolean;
  onClick: () => void;
}) {
  const label = item.asset
    ? `${item.metric} · ${item.asset}`
    : item.bridge
    ? `${item.metric} · ${item.bridge}`
    : item.metric;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm transition-colors text-left ${
        active
          ? "border-stellar-blue bg-stellar-blue/10 text-white"
          : "border-stellar-border bg-stellar-card text-stellar-text-secondary hover:text-white hover:border-stellar-blue/50"
      }`}
    >
      <p className="font-medium capitalize">{label}</p>
      <p className="text-xs text-stellar-text-secondary mt-0.5">{item.nodeCount} nodes</p>
    </button>
  );
}

function NodeDrawer({
  node,
  edges,
  nodeMap,
  onSelectNode,
  onClose,
}: {
  node: LayoutNode;
  edges: ProvenanceGraph["edges"];
  nodeMap: Map<string, LayoutNode>;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}) {
  const connected = edges.filter((e) => e.from === node.id || e.to === node.id);

  return (
    <aside
      className="w-72 shrink-0 rounded-xl border border-stellar-border bg-stellar-card p-5 space-y-4 overflow-y-auto"
      aria-label="Node detail drawer"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-stellar-text-primary leading-tight">
          {node.label}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-stellar-text-secondary hover:text-white text-lg leading-none shrink-0"
          aria-label="Close detail drawer"
        >
          ×
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium border"
          style={{ color: KIND_COLORS[node.kind], borderColor: KIND_COLORS[node.kind] + "55", background: KIND_COLORS[node.kind] + "15" }}
        >
          {KIND_LABEL[node.kind]}
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FRESHNESS_BADGE[node.freshness]}`}>
          {node.freshness}
        </span>
      </div>

      <div className="text-xs text-stellar-text-secondary space-y-1.5">
        <p>
          <span className="text-stellar-text-primary font-medium">ID: </span>
          <span className="font-mono">{node.id}</span>
        </p>
        <p>
          <span className="text-stellar-text-primary font-medium">Entity: </span>
          {node.entityType} · {node.entityId}
        </p>
        <p>
          <span className="text-stellar-text-primary font-medium">Last updated: </span>
          {new Date(node.timestamp).toLocaleString()}
        </p>
      </div>

      {node.description && (
        <p className="text-sm text-stellar-text-secondary">{node.description}</p>
      )}

      {Object.keys(node.metadata).length > 0 && (
        <div className="rounded-lg border border-stellar-border bg-stellar-dark p-3">
          <p className="text-xs font-medium text-stellar-text-primary mb-2">Metadata</p>
          <dl className="space-y-1">
            {Object.entries(node.metadata).map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <dt className="text-stellar-text-secondary shrink-0">{k}</dt>
                <dd className="text-stellar-text-primary font-mono truncate">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {connected.length > 0 && (
        <div>
          <p className="text-xs font-medium text-stellar-text-primary mb-2">
            Connections ({connected.length})
          </p>
          <ul className="space-y-1.5">
            {connected.map((e, i) => {
              const isOut = e.from === node.id;
              const otherId = isOut ? e.to : e.from;
              const other = nodeMap.get(otherId);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onSelectNode(otherId)}
                    className="w-full text-left rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-xs hover:bg-stellar-border/40 transition-colors flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-1 truncate">
                      <span className="text-stellar-text-secondary">{isOut ? "→" : "←"}</span>
                      <span className="text-stellar-text-primary truncate">
                        {other?.label ?? otherId}
                      </span>
                    </span>
                    <span className="text-stellar-text-secondary shrink-0 font-mono">
                      {e.transformKind}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </aside>
  );
}

export default function DataProvenanceGraph() {
  const [filterAsset, setFilterAsset] = useState("");
  const [filterBridge, setFilterBridge] = useState("");
  const [filterMetric, setFilterMetric] = useState("");
  const [selectedMetric, setSelectedMetric] = useState<ProvenanceListItem | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<ProvenanceNodeKind | "all">("all");

  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ["provenance-metrics", filterAsset, filterBridge, filterMetric],
    queryFn: () =>
      getProvenanceMetrics({
        asset: filterAsset || undefined,
        bridge: filterBridge || undefined,
        metric: filterMetric || undefined,
      }),
    staleTime: 30_000,
  });

  const { data: graphData, isLoading: graphLoading, error: graphError } = useQuery<ProvenanceGraph, Error>({
    queryKey: [
      "provenance-lineage",
      selectedMetric?.metric,
      selectedMetric?.asset,
      selectedMetric?.bridge,
    ],
    queryFn: () =>
      getProvenanceLineage(
        selectedMetric!.metric,
        selectedMetric!.asset ?? undefined,
        selectedMetric!.bridge ?? undefined
      ),
    enabled: !!selectedMetric,
    staleTime: 30_000,
  });

  const laidOut = useMemo(() => layoutNodes(graphData?.nodes ?? []), [graphData]);
  const laidOutMap = useMemo(() => new Map(laidOut.map((n) => [n.id, n])), [laidOut]);

  const filteredNodes = useMemo(() => {
    if (filterKind === "all") return laidOut;
    return laidOut.filter((n) => n.kind === filterKind);
  }, [laidOut, filterKind]);
  const filteredIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const visibleEdges = useMemo(
    () =>
      (graphData?.edges ?? []).filter(
        (e) => filteredIds.has(e.from) && filteredIds.has(e.to)
      ),
    [graphData, filteredIds]
  );

  const selectedNode = selectedNodeId ? laidOutMap.get(selectedNodeId) ?? null : null;
  const connectedIds = useMemo(() => {
    if (!selectedNodeId || !graphData) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graphData.edges) {
      if (e.from === selectedNodeId) ids.add(e.to);
      if (e.to === selectedNodeId) ids.add(e.from);
    }
    return ids;
  }, [selectedNodeId, graphData]);

  const metrics = metricsData?.metrics ?? [];
  const freshCount = graphData?.nodes.filter((n) => n.freshness === "fresh").length ?? 0;
  const staleCount = graphData?.nodes.filter((n) => n.freshness === "stale").length ?? 0;

  return (
    <div className="flex flex-col gap-6 h-full">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary mb-1">
          Data Provenance Graph
        </h1>
        <p className="text-stellar-text-secondary text-sm">
          Trace each metric back to its source, transform steps, timestamps, and freshness markers.
        </p>
      </div>

      {/* Metric selector */}
      <section aria-label="Metric filters and selector">
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <input
            type="text"
            placeholder="Filter by asset…"
            value={filterAsset}
            onChange={(e) => setFilterAsset(e.target.value)}
            className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary placeholder-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue w-40"
          />
          <input
            type="text"
            placeholder="Filter by bridge…"
            value={filterBridge}
            onChange={(e) => setFilterBridge(e.target.value)}
            className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary placeholder-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue w-40"
          />
          <select
            value={filterMetric}
            onChange={(e) => setFilterMetric(e.target.value)}
            className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          >
            <option value="">All metric types</option>
            {["price", "health", "tvl", "alerts"].map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {metricsLoading && (
          <p className="text-sm text-stellar-text-secondary">Loading metrics…</p>
        )}

        {!metricsLoading && metrics.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {metrics.map((item) => {
              const key = `${item.metric}:${item.asset ?? item.bridge ?? ""}`;
              const selKey = selectedMetric
                ? `${selectedMetric.metric}:${selectedMetric.asset ?? selectedMetric.bridge ?? ""}`
                : null;
              return (
                <MetricPill
                  key={key}
                  item={item}
                  active={key === selKey}
                  onClick={() => {
                    setSelectedMetric(item);
                    setSelectedNodeId(null);
                  }}
                />
              );
            })}
          </div>
        )}

        {!metricsLoading && metrics.length === 0 && (
          <p className="text-sm text-stellar-text-secondary">No metrics match the current filters.</p>
        )}
      </section>

      {/* Graph area */}
      {selectedMetric && (
        <>
          {/* Summary bar */}
          {graphData && (
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Total nodes", value: graphData.nodes.length, color: "" },
                { label: "Fresh", value: freshCount, color: "text-green-400" },
                { label: "Stale", value: staleCount, color: "text-yellow-400" },
                { label: "Edges", value: graphData.edges.length, color: "" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-stellar-border bg-stellar-card px-4 py-3 min-w-[100px]"
                >
                  <p className="text-xs text-stellar-text-secondary">{s.label}</p>
                  <p className={`text-2xl font-bold ${s.color || "text-stellar-text-primary"}`}>
                    {s.value}
                  </p>
                </div>
              ))}

              <div className="ml-auto flex items-center gap-3">
                <select
                  value={filterKind}
                  onChange={(e) => setFilterKind(e.target.value as ProvenanceNodeKind | "all")}
                  className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                >
                  <option value="all">All node kinds</option>
                  <option value="source">Source</option>
                  <option value="transform">Transform</option>
                  <option value="destination">Destination</option>
                </select>

                {selectedNodeId && (
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId(null)}
                    className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-stellar-text-secondary hover:text-white transition-colors"
                  >
                    Clear selection
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Kind legend */}
          <div className="flex gap-4 flex-wrap text-xs text-stellar-text-secondary items-center">
            {(["source", "transform", "destination"] as ProvenanceNodeKind[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{ background: KIND_COLORS[k] }}
                />
                {KIND_LABEL[k]}
              </span>
            ))}
            <span className="flex items-center gap-1.5 ml-4">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500" />
              Fresh
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-yellow-500" />
              Stale
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-full bg-gray-500" />
              Unknown
            </span>
          </div>

          <div className="flex gap-4 flex-1 min-h-0" style={{ minHeight: 400 }}>
            {/* Graph canvas */}
            <div className="flex-1 rounded-xl border border-stellar-border bg-stellar-card overflow-hidden relative">
              {graphLoading && (
                <div className="absolute inset-0 flex items-center justify-center text-stellar-text-secondary text-sm">
                  Loading lineage graph…
                </div>
              )}
              {graphError && (
                <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm p-4 text-center">
                  {graphError.message}
                </div>
              )}
              {!graphLoading && !graphError && graphData && graphData.nodes.length > 0 && (
                <svg
                  viewBox={`0 0 ${GRAPH_W} ${GRAPH_H}`}
                  className="w-full h-full"
                  aria-label="Data provenance lineage graph"
                >
                  <defs>
                    <marker
                      id="prov-arrow"
                      markerWidth="8"
                      markerHeight="8"
                      refX="6"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L0,6 L8,3 z" fill="#475569" />
                    </marker>
                  </defs>

                  {/* Column headers */}
                  {(["source", "transform", "destination"] as ProvenanceNodeKind[]).map((kind) => {
                    const cols = (["source", "transform", "destination"] as ProvenanceNodeKind[]).filter(
                      (k) => (graphData?.nodes ?? []).some((n) => n.kind === k)
                    );
                    const colIdx = cols.indexOf(kind);
                    if (colIdx === -1) return null;
                    const colW = GRAPH_W / (cols.length + 1);
                    return (
                      <text
                        key={kind}
                        x={colW * (colIdx + 1)}
                        y={22}
                        textAnchor="middle"
                        fontSize={10}
                        fill={KIND_COLORS[kind]}
                        className="select-none"
                        fontWeight={600}
                        letterSpacing={1}
                      >
                        {KIND_LABEL[kind].toUpperCase()}
                      </text>
                    );
                  })}

                  {/* Edges */}
                  {visibleEdges.map((e, i) => {
                    const from = laidOutMap.get(e.from);
                    const to = laidOutMap.get(e.to);
                    if (!from || !to) return null;
                    const hl = selectedNodeId === e.from || selectedNodeId === e.to;
                    return (
                      <EdgeLine
                        key={i}
                        from={from}
                        to={to}
                        transformKind={e.transformKind}
                        latencyMs={e.latencyMs}
                        highlight={hl}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {laidOut
                    .filter((n) => filteredIds.has(n.id))
                    .map((n) => (
                      <GraphNode
                        key={n.id}
                        node={n}
                        selected={selectedNodeId === n.id}
                        dimmed={
                          selectedNodeId !== null &&
                          selectedNodeId !== n.id &&
                          !connectedIds.has(n.id)
                        }
                        onClick={() =>
                          setSelectedNodeId(selectedNodeId === n.id ? null : n.id)
                        }
                      />
                    ))}
                </svg>
              )}
              {!graphLoading && !graphError && graphData && graphData.nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-stellar-text-secondary text-sm">
                  No provenance data available.
                </div>
              )}
            </div>

            {/* Node detail drawer */}
            {selectedNode && (
              <NodeDrawer
                node={selectedNode}
                edges={graphData?.edges ?? []}
                nodeMap={laidOutMap}
                onSelectNode={(id) => setSelectedNodeId(id)}
                onClose={() => setSelectedNodeId(null)}
              />
            )}
          </div>

          {/* Node list table */}
          {graphData && (
            <details className="rounded-xl border border-stellar-border bg-stellar-card">
              <summary className="px-5 py-3 text-sm font-medium text-stellar-text-primary cursor-pointer select-none">
                Node list ({filteredNodes.length})
              </summary>
              <div className="px-5 pb-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stellar-border text-left">
                      {["Label", "Kind", "Entity", "Freshness", "Last updated"].map((h) => (
                        <th key={h} className="py-2 pr-4 text-xs text-stellar-text-secondary font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredNodes.map((n) => (
                      <tr
                        key={n.id}
                        className={`border-b border-stellar-border/40 cursor-pointer hover:bg-stellar-dark/50 transition-colors ${
                          selectedNodeId === n.id ? "bg-stellar-blue/10" : ""
                        }`}
                        onClick={() =>
                          setSelectedNodeId(selectedNodeId === n.id ? null : n.id)
                        }
                      >
                        <td className="py-2 pr-4 text-stellar-text-primary font-medium">{n.label}</td>
                        <td className="py-2 pr-4">
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border"
                            style={{
                              color: KIND_COLORS[n.kind],
                              borderColor: KIND_COLORS[n.kind] + "55",
                              background: KIND_COLORS[n.kind] + "15",
                            }}
                          >
                            {KIND_LABEL[n.kind]}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-stellar-text-secondary text-xs">
                          {n.entityType} · {n.entityId}
                        </td>
                        <td className="py-2 pr-4">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${FRESHNESS_BADGE[n.freshness]}`}>
                            {n.freshness}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-stellar-text-secondary text-xs">
                          {new Date(n.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}

      {!selectedMetric && !metricsLoading && (
        <div className="flex-1 flex items-center justify-center rounded-xl border border-stellar-border bg-stellar-card text-stellar-text-secondary text-sm">
          Select a metric above to view its full lineage graph.
        </div>
      )}
    </div>
  );
}
