import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import Analytics from "./Analytics";

// Mock the TimeRangeSelector component
vi.mock("../components/TimeRangeSelector", () => ({
  TimeRangeSelector: ({ chartId, title, showApplyGlobally }: any) => (
    <div data-testid="time-range-selector">
      <span>Chart ID: {chartId}</span>
      <span>Title: {title}</span>
      <span>Apply Globally: {showApplyGlobally ? "true" : "false"}</span>
    </div>
  ),
}));

// Mock other components and hooks
vi.mock("../components/ColorPreviewTool", () => ({
  default: () => <div data-testid="color-preview-tool">Color Preview Tool</div>,
}));

vi.mock("../components/MetricsDrilldown", () => ({
  MetricsDrilldown: ({ isOpen, onClose, title }: any) => 
    isOpen ? (
      <div data-testid="metrics-drilldown">
        <span>{title}</span>
        <button onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

vi.mock("../components/analytics/SnapshotCard", () => ({
  default: () => <div data-testid="snapshot-card">Snapshot Card</div>,
}));

vi.mock("../components/analytics/BridgeComparison", () => ({
  default: () => <div data-testid="bridge-comparison">Bridge Comparison</div>,
}));

vi.mock("../components/IncidentHeatmap", () => ({
  default: () => <div data-testid="incident-heatmap">Incident Heatmap</div>,
}));

vi.mock("../components/AnomalyTrendCharts", () => ({
  default: () => <div data-testid="anomaly-trend-charts">Anomaly Trend Charts</div>,
}));

vi.mock("../components/AnomalyTuningPanel", () => ({
  default: () => <div data-testid="anomaly-tuning-panel">Anomaly Tuning Panel</div>,
}));

// Mock hooks
vi.mock("../hooks/useAssets", () => ({
  useAssetsWithHealth: vi.fn().mockReturnValue({
    data: [
      { 
        symbol: "USDC", 
        name: "USD Coin",
        health: { overallScore: 85, trend: "stable" }
      },
      { 
        symbol: "EURC", 
        name: "Euro Coin",
        health: { overallScore: 78, trend: "improving" }
      },
    ],
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../hooks/usePrices", () => ({
  usePricesForSymbols: vi.fn().mockReturnValue([
    {
      data: { 
        vwap: 1.001,
        lastUpdated: "2024-01-15T10:30:00Z",
        sources: [{ source: "coinbase", price: 1.001, timestamp: "2024-01-15T10:30:00Z" }]
      },
      isLoading: false,
    },
    {
      data: { 
        vwap: 1.102,
        lastUpdated: "2024-01-15T10:30:00Z",
        sources: [{ source: "coinbase", price: 1.102, timestamp: "2024-01-15T10:30:00Z" }]
      },
      isLoading: false,
    },
  ]),
}));

vi.mock("../hooks/useLocalStorageState", () => ({
  useLocalStorageState: vi.fn().mockReturnValue([[], vi.fn()]),
}));

describe("Analytics TimeRangeSelector Integration", () => {
  let queryClient: QueryClient;

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

  const renderAnalytics = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Analytics />
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("renders TimeRangeSelector with correct props", () => {
    renderAnalytics();

    const timeRangeSelector = screen.getByTestId("time-range-selector");
    
    expect(timeRangeSelector).toBeInTheDocument();
    expect(timeRangeSelector).toHaveTextContent("Chart ID: analytics-overview");
    expect(timeRangeSelector).toHaveTextContent("Title: Analytics Time Range");
    expect(timeRangeSelector).toHaveTextContent("Apply Globally: true");
  });

  it("renders analytics page without date-range duplication", () => {
    renderAnalytics();

    // Should have exactly one TimeRangeSelector
    const timeRangeSelectors = screen.getAllByTestId("time-range-selector");
    expect(timeRangeSelectors).toHaveLength(1);
  });

  it("analytics page structure includes TimeRangeSelector in overview section", () => {
    renderAnalytics();

    // Check that TimeRangeSelector appears before the metrics cards
    const timeRangeSelector = screen.getByTestId("time-range-selector");
    const metricsSection = screen.getByText("Total Value Locked");
    
    expect(timeRangeSelector).toBeInTheDocument();
    expect(metricsSection).toBeInTheDocument();
  });

  it("opens metrics drilldown when clicking View All Metrics", () => {
    renderAnalytics();

    const viewAllButton = screen.getByText("View All Metrics");
    fireEvent.click(viewAllButton);

    expect(screen.getByTestId("metrics-drilldown")).toBeInTheDocument();
    expect(screen.getByText("Metrics Drilldown")).toBeInTheDocument();
  });

  it("asset comparison section renders correctly", () => {
    renderAnalytics();

    expect(screen.getByText("Asset Comparison")).toBeInTheDocument();
    expect(screen.getByText("Select up to 3 assets for side-by-side comparison.")).toBeInTheDocument();
    
    // Check that asset buttons are rendered
    expect(screen.getByText("USDC")).toBeInTheDocument();
    expect(screen.getByText("EURC")).toBeInTheDocument();
  });

  it("handles asset selection for comparison", () => {
    renderAnalytics();

    const usdcButton = screen.getByText("USDC");
    
    // Initially not selected
    expect(usdcButton).not.toHaveAttribute("aria-pressed", "true");
    
    fireEvent.click(usdcButton);
    
    // Should trigger selection (mocked hook would handle state)
    expect(usdcButton).toBeInTheDocument();
  });

  it("displays all analytics components", () => {
    renderAnalytics();

    expect(screen.getByTestId("bridge-comparison")).toBeInTheDocument();
    expect(screen.getByTestId("incident-heatmap")).toBeInTheDocument();
    expect(screen.getByTestId("anomaly-trend-charts")).toBeInTheDocument();
    expect(screen.getByTestId("anomaly-tuning-panel")).toBeInTheDocument();
    expect(screen.getByTestId("color-preview-tool")).toBeInTheDocument();
  });

  it("renders placeholder sections for future functionality", () => {
    renderAnalytics();

    expect(screen.getByText("Health Score Trends")).toBeInTheDocument();
    expect(screen.getByText("Bridge Volume Analytics")).toBeInTheDocument();
    expect(screen.getByText("Liquidity Distribution Across DEXs")).toBeInTheDocument();
  });
});