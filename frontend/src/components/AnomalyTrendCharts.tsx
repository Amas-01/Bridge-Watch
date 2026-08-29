import { useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useAnomalyTrends, type AnomalySeverity } from "../hooks/useAnomalyTrends";
import { useAssetsWithHealth } from "../hooks/useAssets";

const SEVERITY_COLORS: Record<AnomalySeverity, string> = {
  low: "#22c55e",
  medium: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

const SEVERITY_LABELS: Record<AnomalySeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-3 text-xs shadow-xl">
      <p className="text-stellar-text-secondary mb-1">{label}</p>
      {payload
        .filter((p) => p.value > 0)
        .sort((a, b) => b.value - a.value)
        .map((p) => (
          <p key={p.name} className="flex justify-between gap-4" style={{ color: p.color }}>
            <span>{SEVERITY_LABELS[p.name as AnomalySeverity] ?? p.name}</span>
            <span className="font-medium">{p.value}</span>
          </p>
        ))}
    </div>
  );
}

export default function AnomalyTrendCharts() {
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const [days, setDays] = useState(30);

  const { data: assetsData } = useAssetsWithHealth();
  const { data: trendData, isLoading, error } = useAnomalyTrends({
    assetCode: selectedAsset || undefined,
    days,
  });

  const topAssets = Object.entries(trendData?.byAsset ?? {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const handleExport = () => {
    if (!trendData) return;
    const csv = [
      ["Date", "Low", "Medium", "High", "Critical", "Total"],
      ...trendData.trendPoints.map((p) => [p.date, p.low, p.medium, p.high, p.critical, p.total]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anomaly-trends-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-label="Anomaly trend charts" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Anomaly Trends</h2>
          <p className="text-stellar-text-secondary text-sm mt-0.5">
            Frequency and severity of detected anomalies over time
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            className="bg-stellar-card border border-stellar-border text-white text-sm rounded-lg px-3 py-1.5"
            value={selectedAsset}
            onChange={(e) => setSelectedAsset(e.target.value)}
            aria-label="Filter by asset"
          >
            <option value="">All assets</option>
            {(assetsData ?? []).map((a) => (
              <option key={a.symbol} value={a.symbol}>
                {a.symbol}
              </option>
            ))}
          </select>

          <select
            className="bg-stellar-card border border-stellar-border text-white text-sm rounded-lg px-3 py-1.5"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="Time range"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>

          <div className="flex rounded-lg border border-stellar-border overflow-hidden">
            {(["area", "bar"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  chartType === t
                    ? "bg-stellar-blue text-white"
                    : "text-stellar-text-secondary hover:text-white"
                }`}
              >
                {t === "area" ? "Area" : "Bar"}
              </button>
            ))}
          </div>

          <button
            onClick={handleExport}
            disabled={!trendData}
            className="px-3 py-1.5 bg-stellar-card border border-stellar-border text-stellar-text-secondary text-sm rounded-lg hover:text-white transition-colors disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-400 text-sm" role="alert">
          Failed to load anomaly trend data.
        </div>
      )}

      {/* Summary badges */}
      {trendData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["critical", "high", "medium", "low"] as AnomalySeverity[]).map((sev) => (
            <div
              key={sev}
              className="bg-stellar-card border border-stellar-border rounded-lg p-4"
            >
              <p className="text-stellar-text-secondary text-xs uppercase tracking-wide mb-1">
                {SEVERITY_LABELS[sev]}
              </p>
              <p className="text-2xl font-bold" style={{ color: SEVERITY_COLORS[sev] }}>
                {trendData.bySeverity[sev]}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Main trend chart */}
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-sm font-medium text-stellar-text-secondary uppercase tracking-wide mb-4">
          Severity breakdown over time
        </h3>

        {isLoading ? (
          <div className="h-64 bg-stellar-border/30 rounded animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            {chartType === "area" ? (
              <AreaChart data={trendData?.trendPoints ?? []} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {(["critical", "high", "medium", "low"] as AnomalySeverity[]).map((sev) => (
                  <Area
                    key={sev}
                    type="monotone"
                    dataKey={sev}
                    name={sev}
                    stackId="1"
                    stroke={SEVERITY_COLORS[sev]}
                    fill={SEVERITY_COLORS[sev]}
                    fillOpacity={0.6}
                  />
                ))}
              </AreaChart>
            ) : (
              <BarChart data={trendData?.trendPoints ?? []} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  tickFormatter={(v: string) => v.slice(5)}
                />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {(["critical", "high", "medium", "low"] as AnomalySeverity[]).map((sev) => (
                  <Bar
                    key={sev}
                    dataKey={sev}
                    name={sev}
                    stackId="severity"
                    fill={SEVERITY_COLORS[sev]}
                  />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Top assets */}
      {topAssets.length > 0 && (
        <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
          <h3 className="text-sm font-medium text-stellar-text-secondary uppercase tracking-wide mb-4">
            Top assets by anomaly count
          </h3>
          <div className="space-y-3">
            {topAssets.map(([asset, count]) => {
              const max = topAssets[0][1];
              return (
                <div key={asset} className="flex items-center gap-3">
                  <span className="text-white text-sm w-16 shrink-0">{asset}</span>
                  <div className="flex-1 bg-stellar-border rounded-full h-2">
                    <div
                      className="bg-stellar-blue h-2 rounded-full transition-all"
                      style={{ width: `${(count / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-stellar-text-secondary text-sm w-8 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
