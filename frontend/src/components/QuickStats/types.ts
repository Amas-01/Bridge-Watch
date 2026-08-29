import type { AssetWithHealth, Bridge } from "../../types";

export interface StatItem {
  id: string;
  label: string;
  value: string;
  icon: string;
  change?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
  status?: "healthy" | "warning" | "critical" | "neutral";
  href?: string;
}

export type AssetData = AssetWithHealth;
export type BridgeData = Bridge;

export interface QuickStatsProps {
  assets: AssetData[];
  bridges: BridgeData[];
  isLoading?: boolean;
}
