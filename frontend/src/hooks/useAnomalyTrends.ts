import { useQuery } from "@tanstack/react-query";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface AnomalyEvent {
  id: string;
  assetCode: string;
  bridgeName: string | null;
  anomalyType: string;
  severity: AnomalySeverity;
  detected: boolean;
  suppressed: boolean;
  detectedAt: string;
  explanation?: { summary: string };
}

export interface AnomalyTrendPoint {
  date: string;
  low: number;
  medium: number;
  high: number;
  critical: number;
  total: number;
}

export interface AnomalyTrendData {
  trendPoints: AnomalyTrendPoint[];
  totalEvents: number;
  bySeverity: Record<AnomalySeverity, number>;
  byAsset: Record<string, number>;
}

async function fetchAnomalyEvents(params: {
  assetCode?: string;
  bridgeName?: string;
  severity?: AnomalySeverity;
  limit?: number;
}): Promise<AnomalyEvent[]> {
  const query = new URLSearchParams();
  if (params.assetCode) query.set("assetCode", params.assetCode);
  if (params.bridgeName) query.set("bridgeName", params.bridgeName);
  if (params.severity) query.set("severity", params.severity);
  if (params.limit) query.set("limit", String(params.limit));

  const res = await fetch(`/api/v1/anomaly-detection/events?${query}`);
  if (!res.ok) throw new Error("Failed to fetch anomaly events");
  const data = (await res.json()) as { events: AnomalyEvent[] };
  return data.events;
}

function buildTrendData(events: AnomalyEvent[], days = 30): AnomalyTrendData {
  const bySeverity: Record<AnomalySeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  const byAsset: Record<string, number> = {};
  const byDay = new Map<string, Record<AnomalySeverity, number>>();

  // pre-fill last N days
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, { low: 0, medium: 0, high: 0, critical: 0 });
  }

  for (const ev of events) {
    const day = new Date(ev.detectedAt).toISOString().slice(0, 10);
    bySeverity[ev.severity]++;
    byAsset[ev.assetCode] = (byAsset[ev.assetCode] ?? 0) + 1;
    if (byDay.has(day)) {
      byDay.get(day)![ev.severity]++;
    }
  }

  const trendPoints: AnomalyTrendPoint[] = [];
  for (const [date, counts] of byDay) {
    trendPoints.push({
      date,
      ...counts,
      total: counts.low + counts.medium + counts.high + counts.critical,
    });
  }

  return { trendPoints, totalEvents: events.length, bySeverity, byAsset };
}

export function useAnomalyTrends(params: {
  assetCode?: string;
  bridgeName?: string;
  severity?: AnomalySeverity;
  days?: number;
  limit?: number;
} = {}) {
  const { days = 30, ...fetchParams } = params;

  return useQuery({
    queryKey: ["anomaly-trends", fetchParams, days],
    queryFn: async () => {
      const events = await fetchAnomalyEvents({ ...fetchParams, limit: fetchParams.limit ?? 500 });
      return buildTrendData(events, days);
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}
