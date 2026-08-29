import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import LiquidityDashboard from "./LiquidityDashboard";

vi.mock("../hooks/useLiquidity", () => ({
  useLiquidity: () => ({
    depth: {
      pair: "USDC/XLM",
      bids: [],
      asks: [],
      midPrice: 0.123456,
      timestamp: new Date().toISOString(),
    },
    venues: [
      { venue: "SDEX", totalLiquidity: 50000, bidDepth: 25000, askDepth: 25000, share: 50 },
      { venue: "StellarX", totalLiquidity: 30000, bidDepth: 15000, askDepth: 15000, share: 30 },
    ],
    history: [],
    isLoading: false,
    error: null,
    lastUpdated: new Date().toISOString(),
    refetch: vi.fn(),
  }),
}));

vi.mock("../hooks/useLocalStorageState", () => ({
  useLocalStorageState: (_key: string, defaultValue: unknown) => [defaultValue, vi.fn()],
}));

vi.mock("../components/liquidity", () => ({
  LiquidityDepthChart: () => <div data-testid="depth-chart" />,
  LiquidityByVenue: () => <div data-testid="venue-chart" />,
  LiquidityTrend: () => <div data-testid="trend-chart" />,
  PriceImpactCalculator: () => <div data-testid="price-impact" />,
  PairSelector: () => <div data-testid="pair-selector" />,
}));

describe("LiquidityDashboard", () => {
  function renderPage(path = "/liquidity-dashboard") {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/liquidity-dashboard" element={<LiquidityDashboard />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("renders at the /liquidity-dashboard route", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Liquidity" })).toBeInTheDocument();
  });

  it("shows summary stats cards", () => {
    renderPage();
    expect(screen.getByText("Total Liquidity")).toBeInTheDocument();
    expect(screen.getByText("Mid Price")).toBeInTheDocument();
    expect(screen.getByText("Bid Levels")).toBeInTheDocument();
    expect(screen.getByText("Ask Levels")).toBeInTheDocument();
  });

  it("renders the venue table with data", () => {
    renderPage();
    expect(screen.getByText("SDEX")).toBeInTheDocument();
    expect(screen.getByText("StellarX")).toBeInTheDocument();
  });

  it("renders the depth chart component", () => {
    renderPage();
    expect(screen.getByTestId("depth-chart")).toBeInTheDocument();
  });

  it("renders an enabled Export CSV button when depth data is available", () => {
    renderPage();
    const button = screen.getByRole("button", { name: /export csv/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });
});
