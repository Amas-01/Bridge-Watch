import { useState, useMemo, useCallback } from "react";
import type { AssetWithHealth } from "../../types";

type SortDir = "asc" | "desc";
type ColId =
  | "symbol"
  | "health"
  | "liquidityDepth"
  | "priceStability"
  | "bridgeUptime"
  | "reserveBacking"
  | "volumeTrend"
  | "trend";

interface Column {
  id: ColId;
  label: string;
  hint: string;
}

const COLUMNS: Column[] = [
  { id: "symbol", label: "Asset", hint: "Asset code" },
  { id: "health", label: "Health", hint: "Overall health score (0–100)" },
  { id: "liquidityDepth", label: "Liquidity", hint: "Liquidity depth score" },
  { id: "priceStability", label: "Price Stab.", hint: "Price stability score" },
  { id: "bridgeUptime", label: "Uptime", hint: "Bridge uptime score" },
  { id: "reserveBacking", label: "Reserves", hint: "Reserve backing score" },
  { id: "volumeTrend", label: "Volume", hint: "Volume trend score" },
  { id: "trend", label: "Trend", hint: "Overall trend direction" },
];

function scoreColor(score: number | null): string {
  if (score === null) return "text-stellar-text-secondary";
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function trendIcon(trend: string | undefined): string {
  if (!trend) return "—";
  if (trend === "improving") return "↑";
  if (trend === "deteriorating") return "↓";
  return "→";
}

function trendColor(trend: string | undefined): string {
  if (!trend) return "text-stellar-text-secondary";
  if (trend === "improving") return "text-green-400";
  if (trend === "deteriorating") return "text-red-400";
  return "text-yellow-400";
}

function getValue(asset: AssetWithHealth, col: ColId): number | string | null {
  if (col === "symbol") return asset.symbol;
  if (col === "trend") return asset.health?.trend ?? null;
  if (col === "health") return asset.health?.overallScore ?? null;
  return asset.health?.factors[col as keyof typeof asset.health.factors] ?? null;
}

function exportCsv(assets: AssetWithHealth[]) {
  const header = COLUMNS.map((c) => c.label).join(",");
  const rows = assets.map((a) =>
    COLUMNS.map((c) => {
      const v = getValue(a, c.id);
      return v === null ? "" : String(v);
    }).join(",")
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "asset-comparison.csv";
  link.click();
  URL.revokeObjectURL(url);
}

interface Props {
  assets: AssetWithHealth[];
  filter: string;
}

export default function AssetComparisonMatrix({ assets, filter }: Props) {
  const [sortCol, setSortCol] = useState<ColId>("health");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visibleCols, setVisibleCols] = useState<Set<ColId>>(
    new Set(COLUMNS.map((c) => c.id))
  );

  const toggleCol = useCallback((id: ColId) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(id) && next.size > 2) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSort = useCallback(
    (id: ColId) => {
      if (sortCol === id) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortCol(id);
        setSortDir("desc");
      }
    },
    [sortCol]
  );

  const sorted = useMemo(() => {
    const filtered = filter
      ? assets.filter(
          (a) =>
            a.symbol.toLowerCase().includes(filter.toLowerCase()) ||
            a.name.toLowerCase().includes(filter.toLowerCase())
        )
      : assets;

    return [...filtered].sort((a, b) => {
      const va = getValue(a, sortCol);
      const vb = getValue(b, sortCol);

      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;

      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = Number(va);
      const nb = Number(vb);
      return sortDir === "asc" ? na - nb : nb - na;
    });
  }, [assets, filter, sortCol, sortDir]);

  const visibleColumns = COLUMNS.filter((c) => visibleCols.has(c.id));

  if (assets.length === 0) {
    return (
      <div className="text-center py-12 text-stellar-text-secondary text-sm">
        Select assets above to see the comparison matrix.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Column visibility + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-stellar-text-secondary mr-1">Columns:</span>
          {COLUMNS.slice(1).map((col) => (
            <button
              key={col.id}
              type="button"
              onClick={() => toggleCol(col.id)}
              aria-pressed={visibleCols.has(col.id)}
              title={col.hint}
              className={`rounded px-2 py-0.5 text-xs transition-colors focus:outline-none ${
                visibleCols.has(col.id)
                  ? "bg-stellar-blue/20 text-stellar-blue border border-stellar-blue/40"
                  : "border border-stellar-border text-stellar-text-muted"
              }`}
            >
              {col.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => exportCsv(sorted)}
          className="flex items-center gap-1.5 rounded border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary hover:text-white transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-stellar-border">
        <table className="w-full text-sm" aria-label="Asset comparison matrix">
          <thead>
            <tr className="border-b border-stellar-border bg-stellar-dark">
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  scope="col"
                  className="px-4 py-3 text-left"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(col.id)}
                    className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-stellar-text-secondary hover:text-white transition-colors focus:outline-none"
                    title={col.hint}
                    aria-sort={
                      sortCol === col.id
                        ? sortDir === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    {col.label}
                    {sortCol === col.id && (
                      <span className="text-stellar-blue">{sortDir === "asc" ? "↑" : "↓"}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((asset) => (
              <tr
                key={asset.symbol}
                className="border-b border-stellar-border/50 hover:bg-stellar-dark/40 transition-colors"
              >
                {visibleColumns.map((col) => {
                  if (col.id === "symbol") {
                    return (
                      <td key={col.id} className="px-4 py-3">
                        <span className="font-mono font-semibold text-white">{asset.symbol}</span>
                        <br />
                        <span className="text-xs text-stellar-text-secondary">{asset.name}</span>
                      </td>
                    );
                  }
                  if (col.id === "trend") {
                    const trend = asset.health?.trend;
                    return (
                      <td key={col.id} className="px-4 py-3">
                        <span className={`font-medium ${trendColor(trend)}`}>
                          {trendIcon(trend)} {trend ?? "—"}
                        </span>
                      </td>
                    );
                  }
                  const val = getValue(asset, col.id) as number | null;
                  return (
                    <td key={col.id} className="px-4 py-3">
                      <span className={`font-semibold ${scoreColor(val)}`}>
                        {val !== null ? val : "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}

            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="px-4 py-8 text-center text-stellar-text-secondary"
                >
                  No assets match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-stellar-text-muted text-right">
        {sorted.length} asset{sorted.length !== 1 ? "s" : ""} · scores 0–100
      </p>
    </div>
  );
}
