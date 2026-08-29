import { useEffect, useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAssetLiquidity } from "../services/api";
import { useWebSocket } from "./useWebSocket";
import type {
  LiquidityState,
  DepthData,
  VenueLiquidity,
  LiquiditySnapshot,
  TradingPair,
  OrderBookLevel,
} from "../types/liquidity";

interface RawPriceLevel {
  priceImpact: number;
  totalAmount: number;
}

interface RawLiquiditySource {
  dex: string;
  totalLiquidity: number;
  bidDepth: number;
  askDepth: number;
  priceLevels?: RawPriceLevel[];
}

interface RawLiquidityData {
  totalLiquidity?: number;
  sources?: RawLiquiditySource[];
  bestBid?: { price?: number };
  bestAsk?: { price?: number };
  lastUpdated?: string;
}

// Helper function to round to 7 decimal places
function round7(num: number): number {
  return Math.round(num * 1e7) / 1e7;
}

export function useLiquidity(pair: string): LiquidityState {
  // Extract the main asset symbol from the pair if a slash exists.
  // e.g. "USDC/XLM" -> "XLM" (since the backend aggregates against USDC)
  // or "EURC/XLM" -> "EURC"
  const symbol = useMemo(() => {
    if (!pair) return "";
    if (pair.includes("/")) {
      const parts = pair.split("/");
      return parts[0] === "USDC" ? parts[1] : parts[0];
    }
    return pair;
  }, [pair]);

  // Local state to store our formatted/derived data and history
  const [history, setHistory] = useState<LiquiditySnapshot[]>([]);
  const [derivedState, setDerivedState] = useState<{
    depth: DepthData | null;
    venues: VenueLiquidity[];
    lastUpdated: string | null;
  }>({
    depth: null,
    venues: [],
    lastUpdated: null,
  });

  // 1. Fetch initial state using React Query with a polling interval as fallback
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["liquidity", symbol],
    queryFn: () => getAssetLiquidity(symbol),
    enabled: Boolean(symbol),
    refetchInterval: 5000, // Poll every 5s for real-time-like updates when WS is not sending
    staleTime: 2500,
  });

  // Helper function to process the raw backend data and return new state parts
  const processLiquidityData = useCallback((raw: RawLiquidityData | null | undefined) => {
    if (!raw) return null;

    const totalLiquidity = raw.totalLiquidity || 0;
    const sources = raw.sources || [];

    // 1. Map venues and calculate shares
    const venues: VenueLiquidity[] = sources.map((source) => {
      // Map "StellarX AMM" -> "StellarX" to match the frontend types
      const venue = source.dex === "StellarX AMM" ? "StellarX" : source.dex;
      return {
        venue: venue as VenueLiquidity["venue"],
        totalLiquidity: round7(source.totalLiquidity),
        bidDepth: round7(source.bidDepth),
        askDepth: round7(source.askDepth),
        share: totalLiquidity > 0 ? round7((source.totalLiquidity / totalLiquidity) * 100) : 0,
      };
    });

    // 2. Build DepthData
    const bestBidPrice = raw.bestBid?.price || 0;
    const bestAskPrice = (raw.bestAsk?.price && raw.bestAsk.price !== Infinity) ? raw.bestAsk.price : bestBidPrice;
    const midPrice = (bestBidPrice + bestAskPrice) / 2 || 1;

    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    sources.forEach((source) => {
      const venue = source.dex === "StellarX AMM" ? "StellarX" : source.dex;
      const levels = source.priceLevels || [];
      // First 4 are bids, next 4 are asks
      const bidLevels = levels.slice(0, 4);
      const askLevels = levels.slice(4, 8);

      bidLevels.forEach((level) => {
        const price = bestBidPrice * (1 - level.priceImpact);
        bids.push({
          price: round7(price),
          volume: round7(level.totalAmount),
          venue: venue as OrderBookLevel["venue"],
        });
      });

      askLevels.forEach((level) => {
        const price = bestAskPrice * (1 + level.priceImpact);
        asks.push({
          price: round7(price),
          volume: round7(level.totalAmount),
          venue: venue as OrderBookLevel["venue"],
        });
      });
    });

    // Sort bids descending (highest price first), asks ascending (lowest price first)
    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    const depth: DepthData = {
      pair: pair as TradingPair,
      bids,
      asks,
      midPrice: round7(midPrice),
      timestamp: raw.lastUpdated || new Date().toISOString(),
    };

    return {
      depth,
      venues,
      lastUpdated: depth.timestamp,
      totalLiquidity,
    };
  }, [pair]);

  // Synchronise state from React Query data
  useEffect(() => {
    if (data) {
      const processed = processLiquidityData(data);
      if (processed) {
        setDerivedState({
          depth: processed.depth,
          venues: processed.venues,
          lastUpdated: processed.lastUpdated,
        });

        // Add to history (rolling 60 points max)
        setHistory((prev) => {
          // Avoid duplicate entries for the exact same timestamp
          if (prev.length > 0 && prev[prev.length - 1].timestamp === processed.lastUpdated) {
            return prev;
          }
          const nextSnapshot: LiquiditySnapshot = {
            timestamp: processed.lastUpdated || new Date().toISOString(),
            totalLiquidity: processed.totalLiquidity,
            pair: pair as TradingPair,
          };
          const newHistory = [...prev, nextSnapshot];
          if (newHistory.length > 60) {
            newHistory.shift();
          }
          return newHistory;
        });
      }
    }
  }, [data, processLiquidityData, pair]);

  // 2. Subscribe to WebSocket channel
  // Even if the backend does not currently broadcast, we implement it for future-proofing
  // and match the requirements.
  useWebSocket(`liquidity:${symbol}`, (wsData: unknown) => {
    const rawData =
      wsData && typeof wsData === "object" && "data" in wsData
        ? (wsData as { data?: RawLiquidityData }).data
        : (wsData as RawLiquidityData);
    const processed = processLiquidityData(rawData);
    if (processed) {
      setDerivedState({
        depth: processed.depth,
        venues: processed.venues,
        lastUpdated: processed.lastUpdated,
      });

      setHistory((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].timestamp === processed.lastUpdated) {
          return prev;
        }
        const nextSnapshot: LiquiditySnapshot = {
          timestamp: processed.lastUpdated || new Date().toISOString(),
          totalLiquidity: processed.totalLiquidity,
          pair: pair as TradingPair,
        };
        const newHistory = [...prev, nextSnapshot];
        if (newHistory.length > 60) {
          newHistory.shift();
        }
        return newHistory;
      });
    }
  });

  return {
    depth: derivedState.depth,
    venues: derivedState.venues,
    history,
    isLoading: isLoading && !derivedState.depth,
    error: error ? (error instanceof Error ? error.message : "Error loading liquidity") : null,
    lastUpdated: derivedState.lastUpdated,
    refetch,
  };
}
