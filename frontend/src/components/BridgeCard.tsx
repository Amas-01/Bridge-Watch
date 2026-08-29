import { Link } from "react-router-dom";
import type { Bridge, BridgeStats } from "../types";

interface BridgeCardProps {
  bridge: Bridge;
  stats: BridgeStats | null;
}

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    healthy: "bg-green-500/20 text-green-400",
    degraded: "bg-yellow-500/20 text-yellow-400",
    down: "bg-red-500/20 text-red-400",
    unknown: "bg-gray-500/20 text-gray-400",
  };

  return (
    <span
      className={`flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.unknown}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

function getHealthScore(bridge: Bridge): number {
  let score = 100;
  
  if (bridge.status === "down") score -= 50;
  else if (bridge.status === "degraded") score -= 25;
  else if (bridge.status === "unknown") score -= 15;
  
  if (bridge.mismatchPercentage > 1) score -= 30;
  else if (bridge.mismatchPercentage > 0.5) score -= 15;
  
  return Math.max(0, score);
}

export default function BridgeCard({ bridge, stats }: BridgeCardProps) {
  const healthScore = getHealthScore(bridge);

  return (
    <Link
      to={`/bridges/${encodeURIComponent(bridge.name)}`}
      className="block bg-stellar-card border border-stellar-border rounded-lg p-6 hover:border-stellar-blue transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-dark"
      aria-label={`View details for bridge ${bridge.name}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">{bridge.name}</h3>
        {getStatusBadge(bridge.status)}
      </div>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-stellar-text-secondary">Health Score</span>
          <span className={`text-sm font-medium ${
            healthScore >= 80 ? "text-green-400" : 
            healthScore >= 50 ? "text-yellow-400" : 
            "text-red-400"
          }`}>
            {healthScore}/100
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-sm text-stellar-text-secondary">TVL</span>
          <span className="text-sm text-white font-medium">
            {formatNumber(bridge.totalValueLocked)}
          </span>
        </div>

        {stats && (
          <>
            <div className="flex justify-between">
              <span className="text-sm text-stellar-text-secondary">24h Volume</span>
              <span className="text-sm text-white font-medium">
                {formatNumber(stats.volume24h)}
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-sm text-stellar-text-secondary">24h Transactions</span>
              <span className="text-sm text-white font-medium">
                {stats.totalTransactions.toLocaleString()}
              </span>
            </div>
          </>
        )}

        <div className="flex justify-between">
          <span className="text-sm text-stellar-text-secondary">Supply Mismatch</span>
          <span
            className={`text-sm font-medium ${
              bridge.mismatchPercentage > 1
                ? "text-red-400"
                : bridge.mismatchPercentage > 0.5
                  ? "text-yellow-400"
                  : "text-green-400"
            }`}
          >
            {bridge.mismatchPercentage.toFixed(3)}%
          </span>
        </div>
      </div>
    </Link>
  );
}
