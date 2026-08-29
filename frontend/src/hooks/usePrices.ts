import { useQueries, useQuery } from "@tanstack/react-query";
import { getAssetPrice } from "../services/api";

type QueryRefreshOptions = {
  refetchInterval?: number | false;
  refetchOnWindowFocus?: boolean;
};

export function usePrices(symbol: string, options?: QueryRefreshOptions) {
  return useQuery({
    queryKey: ["prices", symbol],
    queryFn: () => getAssetPrice(symbol),
    enabled: !!symbol,
    refetchInterval: options?.refetchInterval,
    refetchOnWindowFocus: options?.refetchOnWindowFocus,
    select: (data) => ({
      ...data,
      sources: data?.sources ?? [],
      history:
        data?.history && data.history.length > 0
          ? data.history
          : (data?.sources ?? []).map((source) => ({
              source: source.source,
              price: source.price,
              timestamp: source.timestamp,
            })),
    }),
  });
}

export function usePricesForSymbols(symbols: string[], options?: QueryRefreshOptions) {
  return useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["prices", symbol],
      queryFn: () => getAssetPrice(symbol),
      enabled: !!symbol,
      refetchInterval: options?.refetchInterval,
      refetchOnWindowFocus: options?.refetchOnWindowFocus,
      select: (data: Awaited<ReturnType<typeof getAssetPrice>>) => ({
        ...data,
        sources: data?.sources ?? [],
        history: [],
      }),
    })),
  });
}
