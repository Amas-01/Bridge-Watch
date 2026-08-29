import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { HealthFactors, HealthStatus } from "../types";
import Sparkline from "./Sparkline";
import Tooltip from "./Tooltip/Tooltip";

interface HealthScoreCardProps {
  symbol: string;
  name?: string;
  overallScore: number | null;
  factors: HealthFactors | null;
  trend: "improving" | "stable" | "deteriorating" | null;
  compact?: boolean;
}

const ASSET_ICONS: Record<string, string> = {
  USDC: "$",
  PYUSD: "$",
  EURC: "€",
  XLM: "✦",
  FOBXX: "F",
};

function getHealthStatus(score: number): HealthStatus {
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

function getStatusColor(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "#22c55e";
    case "warning":
      return "#eab308";
    case "critical":
      return "#ef4444";
  }
}

function getStatusSurfaceClasses(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "bg-green-500/20 text-green-400";
    case "warning":
      return "bg-yellow-500/20 text-yellow-400";
    case "critical":
      return "bg-red-500/20 text-red-400";
  }
}

function getStatusFillClass(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "bg-green-500";
    case "warning":
      return "bg-yellow-500";
    case "critical":
      return "bg-red-500";
  }
}

function getStatusLabel(status: HealthStatus): string {
  switch (status) {
    case "healthy":
      return "Healthy";
    case "warning":
      return "Warning";
    case "critical":
      return "Critical";
  }
}

function getTrendIcon(trend: string | null): string {
  if (trend === "improving") return "↑";
  if (trend === "deteriorating") return "↓";
  return "→";
}

function getTrendColor(trend: string | null): string {
  if (trend === "improving") return "text-green-400";
  if (trend === "deteriorating") return "text-red-400";
  return "text-stellar-text-secondary";
}

function stellarVarRgb(varName: string, fallbackRgb: string): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return fallbackRgb;
    return `rgb(${raw})`;
  } catch {
    return fallbackRgb;
  }
}

const FACTOR_LABELS: Record<keyof HealthFactors, string> = {
  liquidityDepth: "Liquidity",
  priceStability: "Price Stability",
  bridgeUptime: "Bridge Uptime",
  reserveBacking: "Reserve Backing",
  volumeTrend: "Volume Trend",
};

function HealthScoreCardSkeleton({ symbol }: { symbol: string }) {
  return (
    <div
      className="bg-stellar-card border border-stellar-border rounded-lg p-6"
      role="article"
      aria-label={`Loading health data for ${symbol}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-stellar-border animate-pulse" />
        <div className="flex-1">
          <div className="h-5 w-16 bg-stellar-border rounded animate-pulse" />
          <div className="h-4 w-24 bg-stellar-border rounded animate-pulse mt-1" />
        </div>
      </div>
      <div className="flex justify-center mb-4">
        <div className="w-28 h-28 rounded-full bg-stellar-border animate-pulse" />
      </div>
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-4 bg-stellar-border rounded animate-pulse" />
        ))}
      </div>
    </div>
  );
}

export default function HealthScoreCard({
  symbol,
  name,
  overallScore,
  factors,
  trend,
  compact = false,
}: HealthScoreCardProps) {
  if (overallScore === null || factors === null) {
    return <HealthScoreCardSkeleton symbol={symbol} />;
  }

  const status = getHealthStatus(overallScore);
  const statusColor = getStatusColor(status);
  const pieData = [
    { name: "score", value: overallScore },
    { name: "remaining", value: 100 - overallScore },
  ];

  return (
    <div
      className="bg-stellar-card border border-stellar-border rounded-lg p-6 hover:border-stellar-blue transition-colors"
      role="article"
      aria-label={`${symbol} health score: ${overallScore} out of 100, status ${getStatusLabel(status)}`}
    >
      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-xl font-bold ${getStatusSurfaceClasses(status)}`}
          aria-hidden="true"
        >
          {ASSET_ICONS[symbol] || symbol.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-stellar-text-primary truncate">{symbol}</h3>
          {name && (
            <p className="text-sm text-stellar-text-secondary truncate">{name}</p>
          )}
        </div>
        <Tooltip
          placement="left"
          delay={200}
          content={
            <div className="space-y-2">
              <div className="font-semibold text-stellar-text-primary">Health Breakdown</div>
              {(Object.entries(factors) as [keyof HealthFactors, number][]).map(
                ([key, value]) => (
                  <div key={key} className="flex justify-between gap-4 text-xs">
                    <span className="text-stellar-text-secondary">{FACTOR_LABELS[key]}:</span>
                    <span className="font-medium text-stellar-text-primary">{value}/100</span>
                  </div>
                )
              )}
              <div className="border-t border-stellar-border/40 pt-2 mt-2">
                <div className="flex justify-between gap-4 text-xs">
                  <span className="text-stellar-text-secondary font-medium">Overall:</span>
                  <span className="font-bold text-stellar-text-primary">{overallScore}/100</span>
                </div>
              </div>
            </div>
          }
          aria-label={`${symbol} health score breakdown tooltip`}
        >
          <div
            className={`px-2.5 py-1 rounded-full text-xs font-medium cursor-help ${getStatusSurfaceClasses(status)}`}
            role="status"
            aria-label={`Status: ${getStatusLabel(status)}`}
          >
            {getStatusLabel(status)}
          </div>
        </Tooltip>
      </div>

      <div className="flex justify-center mb-4">
        <div className="relative w-28 h-28">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={50}
                startAngle={90}
                endAngle={-270}
                dataKey="value"
                stroke="none"
              >
                <Cell fill={statusColor} />
                <Cell fill={stellarVarRgb("--stellar-border", "rgb(30 35 64)")} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className="text-3xl font-bold text-stellar-text-primary"
              aria-hidden="true"
            >
              {overallScore}
            </span>
            <span
              className={`text-sm flex items-center gap-0.5 ${getTrendColor(trend)}`}
              aria-label={`Trend: ${trend || "stable"}`}
            >
              <span aria-hidden="true">{getTrendIcon(trend)}</span>
              <span className="sr-only">{trend || "stable"}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="mb-4" aria-hidden="true">
        <Sparkline
          symbol={symbol}
          metric="health"
          period="7d"
          height={40}
          showMinMax
          aria-label={`${symbol} health score trend sparkline`}
        />
      </div>

      {!compact && (
        <div className="space-y-2.5" role="list" aria-label="Health factors">
          {(Object.entries(factors) as [keyof HealthFactors, number][]).map(
            ([key, value]) => {
              const factorStatus = getHealthStatus(value);
              return (
                <div
                  key={key}
                  className="grid grid-cols-1 gap-1 xs:flex xs:items-center xs:justify-between xs:gap-2"
                  role="listitem"
                  aria-label={`${FACTOR_LABELS[key]}: ${value} out of 100`}
                >
                  <span className="text-sm text-stellar-text-secondary xs:flex-shrink-0">
                    {FACTOR_LABELS[key]}
                  </span>
                  <div className="flex items-center gap-2 xs:flex-1 xs:justify-end">
                    <div
                      className="flex-1 xs:w-20 xs:flex-none h-1.5 bg-stellar-border rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={value}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${getStatusFillClass(factorStatus)}`}
                        style={{ width: `${value}%` }}
                      />
                    </div>
                    <span className="text-sm text-stellar-text-primary w-7 text-right tabular-nums">
                      {value}
                    </span>
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}
    </div>
  );
}

export { HealthScoreCardSkeleton };
