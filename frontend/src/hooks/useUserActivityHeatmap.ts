import { useQuery } from "@tanstack/react-query";

export interface AuditEntry {
  id: string;
  action: string;
  actorId: string;
  actorType: "user" | "api_key" | "system";
  resourceType: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
}

export interface ActivityCell {
  hour: number;
  dayOfWeek: number;
  count: number;
  actions: string[];
}

export interface UserActivityRow {
  actorId: string;
  totalActions: number;
  cells: ActivityCell[];
  recentActions: string[];
}

export interface HeatmapData {
  users: UserActivityRow[];
  maxCount: number;
  hours: number[];
  days: string[];
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

async function fetchAuditLogs(params: {
  from?: string;
  limit?: number;
}): Promise<{ entries: AuditEntry[]; total: number }> {
  const query = new URLSearchParams();
  if (params.from) query.set("from", params.from);
  query.set("limit", String(params.limit ?? 500));

  const res = await fetch(`/api/v1/admin/audit?${query}`);
  if (!res.ok) throw new Error("Failed to fetch audit logs");
  return res.json() as Promise<{ entries: AuditEntry[]; total: number }>;
}

function buildHeatmapData(entries: AuditEntry[]): HeatmapData {
  const userMap = new Map<string, Map<string, { count: number; actions: Set<string> }>>();

  for (const entry of entries) {
    if (!entry.actorId || entry.actorType === "system") continue;

    const date = new Date(entry.createdAt);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();
    const cellKey = `${dayOfWeek}:${hour}`;

    if (!userMap.has(entry.actorId)) {
      userMap.set(entry.actorId, new Map());
    }
    const cells = userMap.get(entry.actorId)!;

    if (!cells.has(cellKey)) {
      cells.set(cellKey, { count: 0, actions: new Set() });
    }
    const cell = cells.get(cellKey)!;
    cell.count++;
    cell.actions.add(entry.action);
  }

  let maxCount = 0;
  const users: UserActivityRow[] = [];

  for (const [actorId, cellMap] of userMap) {
    const cells: ActivityCell[] = [];
    let total = 0;
    const recentActions = new Set<string>();

    for (let day = 0; day < 7; day++) {
      for (const hour of HOURS) {
        const key = `${day}:${hour}`;
        const data = cellMap.get(key) ?? { count: 0, actions: new Set<string>() };
        cells.push({
          hour,
          dayOfWeek: day,
          count: data.count,
          actions: Array.from(data.actions),
        });
        total += data.count;
        if (data.count > maxCount) maxCount = data.count;
        data.actions.forEach((a) => recentActions.add(a));
      }
    }

    users.push({
      actorId,
      totalActions: total,
      cells,
      recentActions: Array.from(recentActions).slice(0, 5),
    });
  }

  users.sort((a, b) => b.totalActions - a.totalActions);

  return { users, maxCount: Math.max(maxCount, 1), hours: HOURS, days: DAY_LABELS };
}

export function useUserActivityHeatmap(options: { days?: number } = {}) {
  const { days = 7 } = options;

  return useQuery({
    queryKey: ["user-activity-heatmap", days],
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - days);
      const data = await fetchAuditLogs({ from: from.toISOString(), limit: 1000 });
      return buildHeatmapData(data.entries);
    },
    staleTime: 120_000,
    refetchInterval: 300_000,
  });
}
