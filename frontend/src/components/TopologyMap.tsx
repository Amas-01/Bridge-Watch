import React, { useMemo, useState, useRef } from "react";
import type { DependencyGraph, DependencyNodeStatus } from "../types";

interface TopologyMapProps {
  graph: DependencyGraph;
}

const STATUS_COLORS: Record<DependencyNodeStatus, string> = {
  healthy: "#10b981",
  degraded: "#f59e0b",
  down: "#ef4444",
  unknown: "#64748b",
};

export default function TopologyMap({ graph }: TopologyMapProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const lastPos = useRef({ x: 0, y: 0 });

  // Simple layout: circular
  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const radius = Math.min(400, graph.nodes.length * 30 + 100);
    const centerX = 500;
    const centerY = 400;

    graph.nodes.forEach((node, i) => {
      const angle = (i / graph.nodes.length) * 2 * Math.PI;
      positions[node.id] = {
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      };
    });
    return positions;
  }, [graph.nodes]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div className="relative overflow-hidden bg-stellar-dark border border-stellar-border rounded-xl h-[600px] cursor-grab active:cursor-grabbing selection:none">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
        <button
          onClick={() => setZoom((z) => Math.min(z + 0.1, 2))}
          className="w-8 h-8 flex items-center justify-center bg-stellar-card border border-stellar-border rounded text-white hover:bg-stellar-border"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z - 0.1, 0.5))}
          className="w-8 h-8 flex items-center justify-center bg-stellar-card border border-stellar-border rounded text-white hover:bg-stellar-border"
        >
          -
        </button>
        <button
          onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
          className="w-8 h-8 flex items-center justify-center bg-stellar-card border border-stellar-border rounded text-white hover:bg-stellar-border text-xs"
        >
          Reset
        </button>
      </div>

      <div className="absolute bottom-4 left-4 z-10 bg-stellar-card/80 border border-stellar-border p-3 rounded-lg text-[10px] space-y-2">
        <p className="font-bold text-white uppercase tracking-wider mb-1">Topology Legend</p>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-2 text-stellar-text-secondary">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="capitalize">{status}</span>
          </div>
        ))}
      </div>

      <svg
        className="w-full h-full"
        viewBox="0 0 1000 800"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <g transform={`translate(${offset.x}, ${offset.y}) scale(${zoom})`} style={{ transition: isDragging ? 'none' : 'transform 0.1s ease-out' }}>
          {/* Edges */}
          {graph.edges.map((edge, i) => {
            const from = nodePositions[edge.from];
            const to = nodePositions[edge.to];
            if (!from || !to) return null;
            return (
              <line
                key={`edge-${i}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(138, 143, 168, 0.2)"
                strokeWidth="1.5"
              />
            );
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            const pos = nodePositions[node.id];
            if (!pos) return null;
            return (
              <g key={node.id} transform={`translate(${pos.x}, ${pos.y})`}>
                <circle
                  r="12"
                  fill={STATUS_COLORS[node.status]}
                  className="filter drop-shadow-lg"
                  stroke="#1e2340"
                  strokeWidth="2"
                />
                <text
                  y="28"
                  textAnchor="middle"
                  className="fill-stellar-text-primary text-[10px] font-medium pointer-events-none select-none"
                >
                  {node.label}
                </text>
                <circle
                    r="20"
                    fill="transparent"
                    className="cursor-pointer hover:stroke-stellar-blue/50 stroke-2"
                >
                    <title>{node.description}\nStatus: {node.status}\nImpact: {node.impactHint}</title>
                </circle>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
