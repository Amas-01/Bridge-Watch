import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Dashboard from "./Dashboard";
import { WatchlistProvider } from "../hooks/useWatchlist";
import type { AssetWithHealth, Bridge } from "../types";

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../contexts/WebSocketContextValue", () => ({
  useWebSocketContext: () => ({
    connectionState: "connected",
    isPollingFallback: false,
    send: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

vi.mock("../hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    isConnected: true,
    connectionState: "connected",
    lastMessage: null,
    sendMessage: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
  }),
}));

const mockAssets: AssetWithHealth[] = [
  {
    symbol: "USDC",
    name: "USD Coin",
    category: "stablecoin",
    health: {
      symbol: "USDC",
      overallScore: 95,
      factors: {
        liquidityDepth: 95,
        priceStability: 98,
        bridgeUptime: 99,
        reserveBacking: 100,
        volumeTrend: 90,
      },
      trend: "stable",
      lastUpdated: "2026-09-27T12:00:00Z",
    },
  },
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    category: "native",
    health: {
      symbol: "XLM",
      overallScore: 65,
      factors: {
        liquidityDepth: 70,
        priceStability: 60,
        bridgeUptime: 85,
        reserveBacking: 80,
        volumeTrend: 65,
      },
      trend: "improving",
      lastUpdated: "2026-09-27T12:00:00Z",
    },
  },
];

const mockBridges: Bridge[] = [
  {
    name: "Stellar-Ethereum Bridge",
    status: "healthy",
    totalValueLocked: 15000000,
    supplyOnStellar: 15000000,
    supplyOnSource: 15000000,
    mismatchPercentage: 0,
  },
  {
    name: "Stellar-Polygon Bridge",
    status: "degraded",
    totalValueLocked: 4500000,
    supplyOnStellar: 4300000,
    supplyOnSource: 4500000,
    mismatchPercentage: 4.44,
  },
];

const mockRefetchAssets = vi.fn().mockResolvedValue(undefined);
const mockRefetchBridges = vi.fn().mockResolvedValue(undefined);

vi.mock("../hooks/useAssets", () => ({
  useAssetsWithHealth: () => ({
    data: mockAssets,
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetchAssets,
    dataUpdatedAt: Date.now(),
  }),
}));

vi.mock("../hooks/useBridges", () => ({
  useBridges: () => ({
    data: { bridges: mockBridges },
    isLoading: false,
    isError: false,
    error: null,
    refetch: mockRefetchBridges,
    dataUpdatedAt: Date.now(),
  }),
}));

const mockToggleFavoriteBridge = vi.fn();
const mockSetFavoritesFilterMode = vi.fn();
vi.mock("../hooks/useFavorites", () => ({
  useFavorites: () => ({
    favoriteAssets: ["USDC"],
    favoriteBridges: ["Stellar-Ethereum Bridge"],
    favoritesFilterMode: "all" as const,
    setFavoritesFilterMode: mockSetFavoritesFilterMode,
    toggleFavoriteAsset: vi.fn(),
    toggleFavoriteBridge: mockToggleFavoriteBridge,
    isAssetFavorite: (symbol: string) => symbol === "USDC",
    isBridgeFavorite: (name: string) => name === "Stellar-Ethereum Bridge",
  }),
}));

vi.mock("../hooks/useDashboardTour", () => ({
  useDashboardTour: () => ({
    isActive: false,
    step: 0,
    startTour: vi.fn(),
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    endTour: vi.fn(),
  }),
}));

function renderDashboard(initialEntries = ["/dashboard"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <WatchlistProvider>
          <Dashboard />
        </WatchlistProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dashboard Page Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initial Render and KPI metrics", () => {
    it("renders the dashboard title and header description", () => {
      renderDashboard();
      expect(screen.getByRole("heading", { level: 1, name: "Dashboard" })).toBeInTheDocument();
      expect(
        screen.getByText(/Real-time monitoring of bridged assets on the Stellar network/i)
      ).toBeInTheDocument();
    });

    it("displays live update indicator and toolbar actions", () => {
      renderDashboard();
      expect(screen.getByText("Export data")).toBeInTheDocument();
      expect(screen.getByText("Share view")).toBeInTheDocument();
      expect(screen.getByText("Refresh data")).toBeInTheDocument();
    });

    it("renders KPI banner summaries and system health metrics", () => {
      renderDashboard();
      expect(screen.getAllByText("Total Value Locked")[0]).toBeInTheDocument();
      expect(screen.getAllByText("Monitored Assets")[0]).toBeInTheDocument();
      expect(screen.getAllByText("Active Bridges")[0]).toBeInTheDocument();
      expect(screen.getAllByText("System Health")[0]).toBeInTheDocument();
    });
  });

  describe("View Tabs and Filtering", () => {
    it("renders tab options for Overview, Assets, and Bridges", () => {
      renderDashboard();
      expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Assets" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Bridges" })).toBeInTheDocument();
    });

    it("switches to Assets tab when clicked", async () => {
      const user = userEvent.setup();
      renderDashboard();

      const assetsTab = screen.getByRole("tab", { name: "Assets" });
      await user.click(assetsTab);

      // Asset health cards should be visible
      expect(screen.getByText("Asset Health")).toBeInTheDocument();
    });

    it("switches to Bridges tab when clicked", async () => {
      const user = userEvent.setup();
      renderDashboard();

      const bridgesTab = screen.getByRole("tab", { name: "Bridges" });
      await user.click(bridgesTab);

      expect(screen.getAllByText("Stellar-Ethereum Bridge")[0]).toBeInTheDocument();
    });

    it("filters bridge list by status dropdown selection", async () => {
      renderDashboard();

      const statusSelect = screen.getByLabelText("Filter bridges by status");
      expect(statusSelect).toBeInTheDocument();

      fireEvent.change(statusSelect, { target: { value: "healthy" } });
      expect(screen.getAllByText("Stellar-Ethereum Bridge")[0]).toBeInTheDocument();
    });
  });

  describe("Modals and Drawers", () => {
    it("opens and closes the Export picker dialog", async () => {
      const user = userEvent.setup();
      renderDashboard();

      const exportBtn = screen.getByText("Export data");
      await user.click(exportBtn);

      // Dialog opens
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Close modal
      const closeBtn = screen.getByLabelText("Close export dialog");
      await user.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("opens and closes the Share modal", async () => {
      const user = userEvent.setup();
      renderDashboard();

      const shareBtn = screen.getByText("Share view");
      await user.click(shareBtn);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Share dashboard")).toBeInTheDocument();

      const closeBtn = screen.getByLabelText("Close sharing modal");
      await user.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it("triggers refresh when toolbar refresh button is clicked", async () => {
      const user = userEvent.setup();
      renderDashboard();

      const refreshBtn = screen.getByText("Refresh data");
      await user.click(refreshBtn);

      expect(mockRefetchAssets).toHaveBeenCalled();
      expect(mockRefetchBridges).toHaveBeenCalled();
    });
  });

  describe("Favorites and Quick Filter", () => {
    it("toggles bridge favorite chip", async () => {
      const user = userEvent.setup();
      renderDashboard();

      const favoriteChip = screen.getByRole("switch", {
        name: /Remove Stellar-Ethereum Bridge from favorites/i,
      });
      expect(favoriteChip).toBeInTheDocument();

      await user.click(favoriteChip);
      expect(mockToggleFavoriteBridge).toHaveBeenCalledWith("Stellar-Ethereum Bridge");
    });
  });
});
