import { useQuery } from "@tanstack/react-query";
import { getIncidentReplayTimeline } from "../services/api";

export function useIncidentReplay(incidentId: string | undefined) {
  return useQuery({
    queryKey: ["incidentReplay", incidentId],
    queryFn: () => getIncidentReplayTimeline(incidentId!),
    enabled: Boolean(incidentId),
    staleTime: 30_000,
  });
}
