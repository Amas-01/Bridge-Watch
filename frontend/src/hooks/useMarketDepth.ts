import { useQuery } from "@tanstack/react-query";

export interface OrderBookLevel {
  price: number;
  amount: number;
}

export interface MarketDepthSnapshot {
  asset: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  spreadPct: number;
  midPrice: number;
  fetchedAt: string;
}

async function fetchMarketDepth(asset: string): Promise<MarketDepthSnapshot> {
  const response = await fetch(`/api/v1/assets/${asset}/market-depth`);
  if (!response.ok) {
    // Return a synthetic empty snapshot rather than throwing — component handles empty state
    return {
      asset,
      bids: [],
      asks: [],
      spread: 0,
      spreadPct: 0,
      midPrice: 0,
      fetchedAt: new Date().toISOString(),
    };
  }
  return response.json();
}

export function useMarketDepth(asset: string, liveRefreshMs = 10_000) {
  return useQuery({
    queryKey: ["market-depth", asset],
    queryFn: () => fetchMarketDepth(asset),
    enabled: Boolean(asset),
    refetchInterval: liveRefreshMs,
    staleTime: liveRefreshMs / 2,
  });
}
