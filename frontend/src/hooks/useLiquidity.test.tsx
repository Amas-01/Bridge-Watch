/**
 * Tests for useLiquidity hook — liquidity data fetching and aggregation logic
 * Following MSW v2 + renderHook pattern from existing hook tests
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import { useLiquidity } from "./useLiquidity";
import type { ReactNode } from "react";

// Mock useWebSocket to avoid WebSocket setup in tests
vi.mock("./useWebSocket", () => ({
  useWebSocket: vi.fn(() => ({
    send: vi.fn(),
    isConnected: true,
    isSubscribed: true,
  })),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe("useLiquidity", () => {
  beforeAll(() => {
    server.listen();
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("returns loading state initially", () => {
    server.use(
      http.get("/api/v1/assets/:symbol/liquidity", () => {
        return new Promise(() => {}); // Never resolve to keep loading
      })
    );

    const { result } = renderHook(() => useLiquidity("USDC/XLM"), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.depth).toBeNull();
    expect(result.current.venues).toEqual([]);
  });

  it("returns liquidity data on successful fetch", async () => {
    server.use(
      http.get("/api/v1/assets/:symbol/liquidity", ({ params }) => {
        return HttpResponse.json({
          symbol: params.symbol,
          totalLiquidity: 300,
          sources: [
            {
              dex: "StellarX AMM",
              totalLiquidity: 200,
              bidDepth: 100,
              askDepth: 100,
              priceLevels: [
                { priceImpact: 0.01, totalAmount: 50 },
                { priceImpact: 0.02, totalAmount: 100 },
                { priceImpact: 0.03, totalAmount: 150 },
                { priceImpact: 0.04, totalAmount: 200 },
                { priceImpact: 0.01, totalAmount: 50 },
                { priceImpact: 0.02, totalAmount: 100 },
                { priceImpact: 0.03, totalAmount: 150 },
                { priceImpact: 0.04, totalAmount: 200 },
              ],
            },
            {
              dex: "Phoenix",
              totalLiquidity: 100,
              bidDepth: 50,
              askDepth: 50,
              priceLevels: [
                { priceImpact: 0.01, totalAmount: 25 },
                { priceImpact: 0.02, totalAmount: 50 },
                { priceImpact: 0.03, totalAmount: 75 },
                { priceImpact: 0.04, totalAmount: 100 },
                { priceImpact: 0.01, totalAmount: 25 },
                { priceImpact: 0.02, totalAmount: 50 },
                { priceImpact: 0.03, totalAmount: 75 },
                { priceImpact: 0.04, totalAmount: 100 },
              ],
            },
          ],
          bestBid: { price: 1.0 },
          bestAsk: { price: 1.02 },
          lastUpdated: "2024-01-01T00:00:00Z",
        });
      })
    );

    const { result } = renderHook(() => useLiquidity("USDC/XLM"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.depth).not.toBeNull();
    expect(result.current.depth?.pair).toBe("USDC/XLM");
    expect(result.current.venues).toHaveLength(2);
    expect(result.current.lastUpdated).toBe("2024-01-01T00:00:00Z");
    expect(result.current.error).toBeNull();
  });

  it("aggregation logic calculates share percentages correctly", async () => {
    server.use(
      http.get("/api/v1/assets/:symbol/liquidity", () => {
        return HttpResponse.json({
          symbol: "XLM",
          totalLiquidity: 300,
          sources: [
            { dex: "StellarX AMM", totalLiquidity: 200, bidDepth: 100, askDepth: 100 },
            { dex: "Phoenix", totalLiquidity: 100, bidDepth: 50, askDepth: 50 },
          ],
          bestBid: { price: 1.0 },
          bestAsk: { price: 1.0 },
        });
      })
    );

    const { result } = renderHook(() => useLiquidity("USDC/XLM"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.venues).toHaveLength(2);
    });

    // Test share calculation: 200/300 = 66.66667%, 100/300 = 33.33333%
    // round7 should give us 7 decimal places
    const stellarXVenue = result.current.venues.find((v) => v.venue === "StellarX");
    const phoenixVenue = result.current.venues.find((v) => v.venue === "Phoenix");

    expect(stellarXVenue).toBeDefined();
    expect(phoenixVenue).toBeDefined();

    expect(stellarXVenue?.totalLiquidity).toBe(200);
    expect(stellarXVenue?.share).toBeCloseTo(66.6666667, 5);

    expect(phoenixVenue?.totalLiquidity).toBe(100);
    expect(phoenixVenue?.share).toBeCloseTo(33.3333333, 5);
  });

  it("maps venue names correctly (StellarX AMM → StellarX)", async () => {
    server.use(
      http.get("/api/v1/assets/:symbol/liquidity", () => {
        return HttpResponse.json({
          symbol: "XLM",
          totalLiquidity: 100,
          sources: [
            { dex: "StellarX AMM", totalLiquidity: 100, bidDepth: 50, askDepth: 50 },
          ],
          bestBid: { price: 1.0 },
          bestAsk: { price: 1.0 },
        });
      })
    );

    const { result } = renderHook(() => useLiquidity("USDC/XLM"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.venues).toHaveLength(1);
    });

    expect(result.current.venues[0]?.venue).toBe("StellarX");
  });

  it("returns multiple pools correctly", async () => {
    server.use(
      http.get("/api/v1/assets/:symbol/liquidity", () => {
        return HttpResponse.json({
          symbol: "XLM",
          totalLiquidity: 600,
          sources: [
            { dex: "SDEX", totalLiquidity: 200, bidDepth: 100, askDepth: 100 },
            { dex: "StellarX AMM", totalLiquidity: 250, bidDepth: 125, askDepth: 125 },
            { dex: "Phoenix", totalLiquidity: 150, bidDepth: 75, askDepth: 75 },
          ],
          bestBid: { price: 1.0 },
          bestAsk: { price: 1.0 },
        });
      })
    );

    const { result } = renderHook(() => useLiquidity("USDC/XLM"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.venues).toHaveLength(3);
    });

    expect(result.current.venues.map((v) => v.venue)).toEqual(
      expect.arrayContaining(["SDEX", "StellarX", "Phoenix"])
    );

    const total = result.current.venues.reduce((sum, v) => sum + v.totalLiquidity, 0);
    expect(total).toBe(600);
  });

  it("returns error state on network failure", async () => {
    server.use(
      http.get("/api/v1/assets/:symbol/liquidity", () => {
        return HttpResponse.json(
          { error: "Network error" },
          { status: 500 }
        );
      })
    );

    const { result } = renderHook(() => useLiquidity("USDC/XLM"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.depth).toBeNull();
  });

  it("returns error state on non-200 response", async () => {
    server.use(
      http.get("/api/v1/assets/:symbol/liquidity", () => {
        return HttpResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      })
    );

    const { result } = renderHook(() => useLiquidity("USDC/XLM"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it("returns empty state on empty API response", async () => {
    server.use(
      http.get("/api/v1/assets/:symbol/liquidity", () => {
        return HttpResponse.json({
          symbol: "XLM",
          totalLiquidity: 0,
          sources: [],
          bestBid: { price: 0 },
          bestAsk: { price: 0 },
        });
      })
    );

    const { result } = renderHook(() => useLiquidity("USDC/XLM"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.venues).toEqual([]);
    expect(result.current.depth?.bids).toEqual([]);
    expect(result.current.depth?.asks).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("refetch triggers new API call", async () => {
    let callCount = 0;

    server.use(
      http.get("/api/v1/assets/:symbol/liquidity", () => {
        callCount++;
        return HttpResponse.json({
          symbol: "XLM",
          totalLiquidity: 100 * callCount,
          sources: [
            { dex: "Phoenix", totalLiquidity: 100 * callCount, bidDepth: 50, askDepth: 50 },
          ],
          bestBid: { price: 1.0 },
          bestAsk: { price: 1.0 },
        });
      })
    );

    const { result } = renderHook(() => useLiquidity("USDC/XLM"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.venues).toHaveLength(1);
    });

    const initialCallCount = callCount;
    const initialLiquidity = result.current.venues[0]?.totalLiquidity;
    expect(initialLiquidity).toBeDefined();

    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.venues[0]?.totalLiquidity).toBeGreaterThan(initialLiquidity!);
    });

    expect(callCount).toBeGreaterThan(initialCallCount);
  });
});
