import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AssetStatusBadge } from "./AssetStatusBadge";
import { bridgeStatusToAssetStatus } from "../utils/status";

interface BridgeStatusCardProps {
  name: string;
  status: "healthy" | "degraded" | "down" | "unknown";
  totalValueLocked: number;
  supplyOnStellar: number;
  supplyOnSource: number;
  mismatchPercentage: number;
  /** Renders above the card link (e.g. favorite chip); keep actions out of the navigation target */
  topRight?: ReactNode;
}



function formatNumber(num: number): string {
  if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

export default function BridgeStatusCard({
  name,
  status,
  totalValueLocked,
  supplyOnStellar,
  supplyOnSource,
  mismatchPercentage,
  topRight,
}: BridgeStatusCardProps) {
  return (
    <div className="relative">
      {topRight ? (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-2">{topRight}</div>
      ) : null}
      <Link
        to={`/bridges?selected=${encodeURIComponent(name)}`}
        className={`block bg-stellar-card border border-stellar-border rounded-lg hover:border-stellar-blue transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-dark ${
          topRight ? "p-6 pt-12" : "p-6"
        }`}
        aria-label={`View details for bridge ${name}`}
      >
      <div
        className={`mb-4 flex items-center justify-between gap-2 ${topRight ? "pr-14" : ""}`}
      >
        <h3 className="text-lg font-semibold text-stellar-text-primary truncate">{name}</h3>
        <AssetStatusBadge status={bridgeStatusToAssetStatus(status)} size="sm" />
      </div>

      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-sm text-stellar-text-secondary">TVL</span>
          <span className="text-sm text-stellar-text-primary font-medium">
            {formatNumber(totalValueLocked)}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-sm text-stellar-text-secondary">
            Supply (Stellar)
          </span>
          <span className="text-sm text-stellar-text-primary font-medium">
            {supplyOnStellar.toLocaleString()}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-sm text-stellar-text-secondary">
            Supply (Source)
          </span>
          <span className="text-sm text-stellar-text-primary font-medium">
            {supplyOnSource.toLocaleString()}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-sm text-stellar-text-secondary">Mismatch</span>
          <span
            className={`text-sm font-medium ${
              mismatchPercentage > 1
                ? "text-red-400"
                : mismatchPercentage > 0.5
                  ? "text-yellow-400"
                  : "text-green-400"
            }`}
          >
            {mismatchPercentage.toFixed(3)}%
          </span>
        </div>
      </div>
      </Link>
    </div>
  );
}
