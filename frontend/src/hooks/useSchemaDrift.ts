import { useQuery } from "@tanstack/react-query";
import { getSchemaDriftReport } from "../services/api";
import type { SchemaDriftReport } from "../services/api";

export function useSchemaDrift(opts?: { refetchInterval?: number | false }) {
  const { data, isLoading, error, refetch } = useQuery<SchemaDriftReport>({
    queryKey: ["schema-drift-report"],
    queryFn: getSchemaDriftReport,
    refetchInterval: opts?.refetchInterval ?? 30_000,
    staleTime: 15_000,
  });

  return {
    summary: data?.summary ?? [],
    recentIncidents: data?.recentIncidents ?? [],
    isLoading,
    error: error ? (error instanceof Error ? error.message : "Failed to load schema drift data") : null,
    refetch,
  };
}
