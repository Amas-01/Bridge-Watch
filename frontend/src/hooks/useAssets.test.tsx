/**
 * Tests for the asset data-fetching hooks (useAssets, useAssetsWithHealth,
 * useAssetHealth, useHealthUpdater) — following the MSW v2 + renderHook
 * convention used by the other hook tests.
 */
import { describe, it, expect } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../test/mocks/server";
import {
  useAssets,
  useAssetsWithHealth,
  useAssetHealth,
  useHealthUpdater,
} from "./useAssets";
import type { AssetWithHealth, HealthScore } from "../types";
import type { ReactNode } from "react";

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function createWrapper(client?: QueryClient) {
  const queryClient = client ?? makeClient();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useAssets", () => {
  it("starts in a loading state", () => {
    server.use(
      http.get("/api/v1/assets", () => new Promise(() => {})) // never resolves
    );

    const { result } = renderHook(() => useAssets(), { wrapper: createWrapper() });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("fetches the list of assets", async () => {
    const { result } = renderHook(() => useAssets(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.assets).toHaveLength(2);
    expect(result.current.data?.assets[0].symbol).toBe("XLM");
    expect(result.current.data?.total).toBe(2);
  });

  it("surfaces an error state on a failed request", async () => {
    server.use(
      http.get("/api/v1/assets", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useAssets(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeDefined();
  });

  it("refetches when explicitly invalidated", async () => {
    let callCount = 0;
    server.use(
      http.get("/api/v1/assets", () => {
        callCount += 1;
        return HttpResponse.json({
          assets: [{ symbol: "XLM", name: "Stellar" }],
          total: 1,
        });
      })
    );

    const { result } = renderHook(() => useAssets(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const initial = callCount;

    await act(async () => {
      await result.current.refetch();
    });

    expect(callCount).toBeGreaterThan(initial);
  });
});

describe("useAssetsWithHealth", () => {
  it("combines assets with their health scores", async () => {
    const { result } = renderHook(() => useAssetsWithHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].health?.overallScore).toBe(85);
  });

  it("falls back to null health when a health request fails", async () => {
    server.use(
      http.get("/api/v1/assets/:symbol/health", () =>
        HttpResponse.json({ error: "no health" }, { status: 500 })
      )
    );

    const { result } = renderHook(() => useAssetsWithHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].health).toBeNull();
  });
});

describe("useAssetHealth", () => {
  it("fetches the health score for a symbol", async () => {
    const { result } = renderHook(() => useAssetHealth("USDC"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.overallScore).toBe(85);
    expect(result.current.data?.symbol).toBe("USDC");
  });

  it("is disabled when no symbol is provided", () => {
    const { result } = renderHook(() => useAssetHealth(""), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
  });
});

describe("useHealthUpdater", () => {
  it("patches the cached asset health for the matching symbol", async () => {
    const client = makeClient();
    const seed: AssetWithHealth[] = [
      { symbol: "USDC", name: "USDC", health: null },
      { symbol: "XLM", name: "Stellar", health: null },
    ];
    client.setQueryData(["assets-with-health"], seed);

    const { result } = renderHook(() => useHealthUpdater(), {
      wrapper: createWrapper(client),
    });

    const updated: HealthScore = {
      symbol: "USDC",
      overallScore: 42,
      factors: {
        liquidityDepth: 1,
        priceStability: 2,
        bridgeUptime: 3,
        reserveBacking: 4,
        volumeTrend: 5,
      },
      trend: "improving",
      lastUpdated: "2024-01-01T00:00:00Z",
    };

    act(() => {
      result.current.updateHealth(updated);
    });

    const cached = client.getQueryData<AssetWithHealth[]>(["assets-with-health"]);
    expect(cached?.find((a) => a.symbol === "USDC")?.health?.overallScore).toBe(42);
    // Other assets remain untouched.
    expect(cached?.find((a) => a.symbol === "XLM")?.health).toBeNull();
  });

  it("is a no-op when no cached data exists", () => {
    const client = makeClient();
    const { result } = renderHook(() => useHealthUpdater(), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.updateHealth({
        symbol: "USDC",
        overallScore: 10,
        factors: {
          liquidityDepth: 1,
          priceStability: 2,
          bridgeUptime: 3,
          reserveBacking: 4,
          volumeTrend: 5,
        },
        trend: "stable",
        lastUpdated: "2024-01-01T00:00:00Z",
      });
    });

    expect(client.getQueryData(["assets-with-health"])).toBeUndefined();
  });
});
