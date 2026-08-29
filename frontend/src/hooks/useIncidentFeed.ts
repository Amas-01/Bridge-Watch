import { useCallback, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type IncidentSeverity = "critical" | "high" | "medium" | "low";
export type IncidentStatus = "open" | "investigating" | "resolved";

export interface BridgeIncident {
  id: string;
  bridgeId: string;
  assetCode: string | null;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  description: string;
  sourceUrl: string | null;
  sourceType: string | null;
  sourceExternalId: string | null;
  sourceRepository: string | null;
  sourceRepoAvatarUrl: string | null;
  sourceActor: string | null;
  sourceAttribution: Record<string, unknown>;
  requiresManualReview: boolean;
  ingestionAttemptCount: number;
  lastIngestionError: string | null;
  normalizedFingerprint: string | null;
  followUpActions: string[];
  occurredAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface IncidentFilters {
  bridgeId?: string;
  assetCode?: string;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
}

async function fetchIncidents(filters: IncidentFilters): Promise<{ incidents: BridgeIncident[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.bridgeId) params.set("bridgeId", filters.bridgeId);
  if (filters.assetCode) params.set("assetCode", filters.assetCode);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.status) params.set("status", filters.status);

  const response = await fetch(`/api/v1/incidents?${params.toString()}`);
  if (!response.ok) throw new Error("Failed to fetch incidents");
  return response.json();
}

async function markIncidentRead(incidentId: string, userSession: string): Promise<void> {
  await fetch(`/api/v1/incidents/${incidentId}/read`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userSession }),
  });
}

function getOrCreateSession(): string {
  const key = "bw_user_session";
  let session = localStorage.getItem(key);
  if (!session) {
    session = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(key, session);
  }
  return session;
}

export function useIncidentFeed(filters: IncidentFilters = {}) {
  const queryClient = useQueryClient();
  const userSession = getOrCreateSession();

  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("bw_read_incidents");
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["incidents", filters],
    queryFn: () => fetchIncidents(filters),
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: ({ incidentId }: { incidentId: string }) =>
      markIncidentRead(incidentId, userSession),
    onSuccess: (_, { incidentId }) => {
      setReadIds((prev) => {
        const next = new Set(prev);
        next.add(incidentId);
        localStorage.setItem("bw_read_incidents", JSON.stringify([...next]));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
  });

  const markRead = useCallback(
    (incidentId: string) => markReadMutation.mutate({ incidentId }),
    [markReadMutation]
  );

  // Subscribe to real-time updates via WebSocket channel
  useEffect(() => {
    const ws = new WebSocket(`ws://${window.location.host}/api/v1/ws`);
    const onMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as { channel?: string };
        if (msg.channel === "incident-updates") {
          refetch();
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener("message", onMessage);
    return () => {
      ws.removeEventListener("message", onMessage);
      ws.close();
    };
  }, [refetch]);

  const incidents = data?.incidents ?? [];
  const unreadCount = incidents.filter((i) => !readIds.has(i.id)).length;

  return {
    incidents,
    total: data?.total ?? 0,
    unreadCount,
    isLoading,
    error,
    readIds,
    markRead,
    refetch,
  };
}
