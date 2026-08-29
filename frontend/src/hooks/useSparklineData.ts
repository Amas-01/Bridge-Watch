import { useQuery } from "@tanstack/react-query";
import { getAssetHealthHistory, getAssetPriceSparkline, getAssetVolumeSparkline } from "../services/api";

export type SparklinePeriod = "24h" | "7d" | "30d";
export type SparklineMetric = "health" | "price" | "volume";

export interface SparklinePoint {
  timestamp: string;
  value: number;
}

function downsample(points: SparklinePoint[], maxPoints: number): SparklinePoint[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const sampled: SparklinePoint[] = [];
  for (let i = 0; i < points.length; i += step) {
    sampled.push(points[i]);
  }
  return sampled;
}

function normalizePeriod(period: SparklinePeriod | undefined): SparklinePeriod {
  return period ?? "7d";
}

function sortByTimestamp(points: SparklinePoint[]): SparklinePoint[] {
  return [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export function useSparklineData({
  symbol,
  metric,
  period,
  enabled,
}: {
  symbol: string;
  metric: SparklineMetric;
  period?: SparklinePeriod;
  enabled?: boolean;
}) {
  const p = normalizePeriod(period);

  const maxPoints = p === "24h" ? 48 : p === "30d" ? 180 : 84;

  return useQuery({
    queryKey: ["sparkline", metric, symbol, p],
    enabled: !!symbol && (enabled ?? true),
    queryFn: async (): Promise<SparklinePoint[]> => {
      if (metric === "health") {
        const res = await getAssetHealthHistory(symbol, p);
        const points = res?.points ?? [];
        const normalized = points
          .map((pt) => ({ timestamp: pt.timestamp, value: pt.score }));

        return downsample(sortByTimestamp(normalized), maxPoints);
      }

      if (metric === "price") {
        const res = await getAssetPriceSparkline(symbol, p);
        const points = res?.points ?? [];
        return downsample(sortByTimestamp(points), maxPoints);
      }

      if (metric === "volume") {
        const res = await getAssetVolumeSparkline(symbol, p);
        const points = res?.points ?? [];
        return downsample(sortByTimestamp(points), maxPoints);
      }

      return [];
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
  });
}
