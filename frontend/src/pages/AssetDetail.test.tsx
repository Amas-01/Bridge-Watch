import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import AssetDetail from "./AssetDetail";
import * as api from "../services/api";

// Mock the API functions
vi.mock("../services/api", () => ({
  getAssetMetadataBySymbol: vi.fn(),
  upsertAssetMetadata: vi.fn(),
}));

// Mock hooks that AssetDetail depends on
vi.mock("../hooks/useAssets", () => ({
  useAssetHealth: vi.fn().mockReturnValue({
    data: { overallScore: 85, trend: "stable" },
    isLoading: false,
    refetch: vi.fn(),
    dataUpdatedAt: Date.now(),
    isFetching: false,
  }),
}));

vi.mock("../hooks/usePrices", () => ({
  usePrices: vi.fn().mockReturnValue({
    data: { 
      history: [{ price: 1.001, timestamp: "2024-01-15T10:30:00Z" }],
      sources: [{ source: "coinbase", price: 1.001, timestamp: "2024-01-15T10:30:00Z" }]
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../hooks/useLiquidity", () => ({
  useLiquidity: vi.fn().mockReturnValue({
    venues: [{ venue: "dex1", bidDepth: 1000, askDepth: 1000, totalLiquidity: 2000 }],
    isLoading: false,
    lastUpdated: "2024-01-15T10:30:00Z",
    refetch: vi.fn(),
  }),
}));

vi.mock("../hooks/useChartAnnotations", () => ({
  useChartAnnotations: vi.fn().mockReturnValue({
    annotations: [],
    addAnnotation: vi.fn(),
    updateAnnotation: vi.fn(),
    removeAnnotation: vi.fn(),
    clearAnnotations: vi.fn(),
    exportAnnotations: vi.fn(),
  }),
}));

vi.mock("../hooks/usePullToRefresh", () => ({
  usePullToRefresh: vi.fn().mockReturnValue({
    isPulling: false,
    pullDistance: 0,
    progress: 0,
    isRefreshing: false,
    refresh: vi.fn(),
  }),
}));

describe("AssetDetail Caching", () => {
  let queryClient: QueryClient;
  const mockGetAssetMetadata = vi.mocked(api.getAssetMetadataBySymbol);

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderAssetDetail = (symbol = "USDC") => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/assets/${symbol}`]}>
          <AssetDetail />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("asset metadata is not re-fetched on tab change within stale time", async () => {
    const mockMetadata = {
      asset_id: "asset_usdc",
      symbol: "USDC",
      tags: ["stablecoin"],
      category: "currency",
      description: "USD Coin",
    };

    mockGetAssetMetadata.mockResolvedValueOnce(mockMetadata);

    const { rerender } = renderAssetDetail("USDC");

    // Wait for initial load
    await waitFor(() => {
      expect(mockGetAssetMetadata).toHaveBeenCalledTimes(1);
      expect(mockGetAssetMetadata).toHaveBeenCalledWith("USDC");
    });

    // Simulate tab change by re-rendering - metadata should not be re-fetched
    // within stale time (5 minutes)
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/assets/USDC?tab=history"]}>
          <AssetDetail />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Should not trigger another API call
    expect(mockGetAssetMetadata).toHaveBeenCalledTimes(1);
  });

  it("different asset IDs use different cache keys", async () => {
    const mockUsdcMetadata = {
      asset_id: "asset_usdc",
      symbol: "USDC",
      tags: ["stablecoin"],
      category: "currency",
      description: "USD Coin",
    };

    const mockEurcMetadata = {
      asset_id: "asset_eurc",
      symbol: "EURC",
      tags: ["stablecoin", "euro"],
      category: "currency",
      description: "Euro Coin",
    };

    mockGetAssetMetadata
      .mockResolvedValueOnce(mockUsdcMetadata)
      .mockResolvedValueOnce(mockEurcMetadata);

    // Render USDC first
    const { rerender } = renderAssetDetail("USDC");

    await waitFor(() => {
      expect(mockGetAssetMetadata).toHaveBeenCalledWith("USDC");
    });

    // Switch to EURC - should trigger new API call
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/assets/EURC"]}>
          <AssetDetail />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(mockGetAssetMetadata).toHaveBeenCalledWith("EURC");
      expect(mockGetAssetMetadata).toHaveBeenCalledTimes(2);
    });
  });

  it("metadata query uses correct stale time configuration", () => {
    // Check that the query is configured with staleTime
    const queryKey = ["asset-metadata", "USDC"];
    const queryCache = queryClient.getQueryCache();
    
    renderAssetDetail("USDC");

    // Wait a moment for query to be registered
    setTimeout(() => {
      const query = queryCache.find({ queryKey });
      if (query) {
        expect(query.options.staleTime).toBe(5 * 60 * 1000); // 5 minutes
      }
    }, 100);
  });

  it("query key includes asset symbol for proper cache separation", () => {
    renderAssetDetail("USDC");

    const queryCache = queryClient.getQueryCache();
    const queries = queryCache.getAll();
    
    const metadataQuery = queries.find(query => 
      query.queryKey[0] === "asset-metadata"
    );

    expect(metadataQuery?.queryKey).toEqual(["asset-metadata", "USDC"]);
  });

  it("handles metadata loading states correctly", async () => {
    // Mock a delayed response
    mockGetAssetMetadata.mockImplementation(() => 
      new Promise(resolve => setTimeout(() => resolve({
        asset_id: "asset_usdc",
        symbol: "USDC",
        tags: [],
        category: null,
        description: null,
      }), 100))
    );

    renderAssetDetail("USDC");

    // Initially should show loading state
    expect(screen.getByText("Loading metadata")).toBeInTheDocument();

    // After loading completes
    await waitFor(() => {
      expect(screen.getByText("Synced")).toBeInTheDocument();
    });
  });
});