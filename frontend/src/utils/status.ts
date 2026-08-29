import { AssetStatus } from "../components/AssetStatusBadge";

/** Map a health score (0-100) to an AssetStatus. */
export function scoreToStatus(score: number | null | undefined): AssetStatus {
  if (score === null || score === undefined) return "unknown";
  if (score >= 80) return "healthy";
  if (score >= 50) return "warning";
  return "critical";
}

/** Map a bridge status string to an AssetStatus. */
export function bridgeStatusToAssetStatus(
  status: "healthy" | "degraded" | "down" | "unknown" | string
): AssetStatus {
  if (status === "healthy") return "healthy";
  if (status === "degraded") return "warning";
  if (status === "down") return "critical";
  return "unknown";
}
