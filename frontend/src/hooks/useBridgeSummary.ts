import { useQuery } from "@tanstack/react-query";
import { getBridges, getBridgeStats } from "../services/api";
import type { BridgeSummary } from "../types";

type QueryRefreshOptions = {
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
};

/**
 * Hook to fetch bridge summary data combining bridge status and statistics
 * @param options - Query configuration options
 * @returns Query result with array of bridge summaries
 */
export function useBridgeSummaries(options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["bridge-summaries"],
    queryFn: async (): Promise<BridgeSummary[]> => {
      const response = await getBridges();
      const bridges = response.bridges;
      
      // Fetch stats for each bridge in parallel
      const statsPromises = bridges.map((bridge) =>
        getBridgeStats(bridge.name)
          .catch(() => null) // Handle individual stat fetch failures
      );
      
      const statsResults = await Promise.all(statsPromises);
      
      // Combine bridge data with stats to create summaries
      const summaries: BridgeSummary[] = bridges.map((bridge, index: number) => {
        const stats = statsResults[index];
        return {
          id: bridge.name.toLowerCase().replace(/\s+/g, "-"),
          name: bridge.name,
          status: bridge.status,
          coverage: stats?.uptime30d ?? 0, // Use 30-day uptime as coverage metric
          performance: stats?.averageTransferTime ?? 0, // Average transfer time as performance metric
          totalValueLocked: bridge.totalValueLocked,
          supplyOnStellar: bridge.supplyOnStellar,
          supplyOnSource: bridge.supplyOnSource,
          mismatchPercentage: bridge.mismatchPercentage,
          lastUpdated: new Date().toISOString(), // Would be better if API provided this
        };
      });
      
      return summaries;
    },
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}

/**
 * Hook to fetch a single bridge summary by name
 * @param bridgeName - The name of the bridge to fetch
 * @param options - Query configuration options
 * @returns Query result with single bridge summary
 */
export function useBridgeSummary(bridgeName: string, options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["bridge-summary", bridgeName],
    queryFn: async (): Promise<BridgeSummary> => {
      const response = await getBridges();
      const bridges = response.bridges;
      const bridge = bridges.find((b: typeof bridges[0]) => b.name === bridgeName);
      
      if (!bridge) {
        throw new Error(`Bridge not found: ${bridgeName}`);
      }
      
      const stats = await getBridgeStats(bridgeName).catch(() => null);
      
      const summary: BridgeSummary = {
        id: bridge.name.toLowerCase().replace(/\s+/g, "-"),
        name: bridge.name,
        status: bridge.status,
        coverage: stats?.uptime30d ?? 0,
        performance: stats?.averageTransferTime ?? 0,
        totalValueLocked: bridge.totalValueLocked,
        supplyOnStellar: bridge.supplyOnStellar,
        supplyOnSource: bridge.supplyOnSource,
        mismatchPercentage: bridge.mismatchPercentage,
        lastUpdated: new Date().toISOString(),
      };
      
      return summary;
    },
    enabled: !!bridgeName,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
  });
}
