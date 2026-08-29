import { useQuery } from "@tanstack/react-query";
import { getExternalDependencies } from "../services/api";

export type ServiceStatus = "healthy" | "degraded" | "down" | "maintenance" | "unknown";

export interface ServiceHealthData {
  name: string;
  status: ServiceStatus;
  category: string;
}

export interface ServiceHealthSummary {
  overallStatus: ServiceStatus;
  services: ServiceHealthData[];
  totalServices: number;
  healthyCount: number;
  degradedCount: number;
  downCount: number;
  maintenanceCount: number;
  unknownCount: number;
  lastUpdated: Date;
}

/**
 * Determines the overall system status based on worst-case aggregation.
 * Priority: down > degraded > maintenance > unknown > healthy
 */
function aggregateOverallStatus(summary: {
  healthy: number;
  degraded: number;
  down: number;
  maintenance: number;
  unknown: number;
}): ServiceStatus {
  if (summary.down > 0) return "down";
  if (summary.degraded > 0) return "degraded";
  if (summary.maintenance > 0) return "maintenance";
  if (summary.unknown > 0) return "unknown";
  return "healthy";
}

type QueryRefreshOptions = {
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
};

/**
 * Hook to fetch and aggregate service health data.
 * Polls the external dependencies endpoint and derives overall system status.
 *
 * @param options - React Query refresh options
 * @returns Service health summary with loading and error states
 */
export function useServiceHealth(options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["service-health"],
    queryFn: async (): Promise<ServiceHealthSummary> => {
      const data = await getExternalDependencies(false, 0);

      const services: ServiceHealthData[] = data.dependencies.map((dep) => ({
        name: dep.displayName,
        status: dep.status,
        category: dep.category,
      }));

      const overallStatus = aggregateOverallStatus(data.summary);

      return {
        overallStatus,
        services,
        totalServices: data.dependencies.length,
        healthyCount: data.summary.healthy,
        degradedCount: data.summary.degraded,
        downCount: data.summary.down,
        maintenanceCount: data.summary.maintenance,
        unknownCount: data.summary.unknown,
        lastUpdated: new Date(),
      };
    },
    refetchInterval: options?.refetchInterval ?? 60_000,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
  });
}
