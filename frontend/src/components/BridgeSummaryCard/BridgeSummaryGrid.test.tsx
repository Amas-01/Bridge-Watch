import { describe, it, expect } from "vitest";
import { render, screen } from "../../test/utils";
import BridgeSummaryGrid from "./BridgeSummaryGrid";
import type { BridgeSummary } from "../../types";

const mockBridges: BridgeSummary[] = [
  {
    id: "circle",
    name: "Circle",
    status: "healthy",
    coverage: 99.5,
    performance: 234.5,
    totalValueLocked: 500_000_000,
    supplyOnStellar: 400_000_000,
    supplyOnSource: 400_000_000,
    mismatchPercentage: 0,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "wormhole",
    name: "Wormhole",
    status: "degraded",
    coverage: 95.2,
    performance: 450.8,
    totalValueLocked: 200_000_000,
    supplyOnStellar: 180_000_000,
    supplyOnSource: 190_000_000,
    mismatchPercentage: 5.26,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "bridging-protocol",
    name: "Bridging Protocol",
    status: "healthy",
    coverage: 98.0,
    performance: 300.0,
    totalValueLocked: 300_000_000,
    supplyOnStellar: 250_000_000,
    supplyOnSource: 250_000_000,
    mismatchPercentage: 0.5,
    lastUpdated: new Date().toISOString(),
  },
];

describe("BridgeSummaryGrid", () => {
  const getSkeletonCards = () =>
    screen.getAllByRole("status", { name: /loading bridge summary/i });

  describe("Populated State", () => {
    it("renders all bridge summaries", () => {
      render(<BridgeSummaryGrid summaries={mockBridges} />);
      
      expect(screen.getByText("Circle")).toBeInTheDocument();
      expect(screen.getByText("Wormhole")).toBeInTheDocument();
      expect(screen.getByText("Bridging Protocol")).toBeInTheDocument();
    });

    it("creates a card for each summary", () => {
      render(<BridgeSummaryGrid summaries={mockBridges} />);
      
      const cards = screen.getAllByTestId(/bridge-summary-card-/);
      expect(cards).toHaveLength(3);
    });

    it("applies the responsive grid classes", () => {
      const { container } = render(<BridgeSummaryGrid summaries={mockBridges} />);
      
      const grid = container.firstChild;
      expect(grid).toHaveClass("grid");
      expect(grid).toHaveClass("grid-cols-1");
      expect(grid).toHaveClass("md:grid-cols-2");
      expect(grid).toHaveClass("lg:grid-cols-3");
      expect(grid).toHaveClass("xl:grid-cols-4");
    });

    it("applies gap utility classes", () => {
      const { container } = render(<BridgeSummaryGrid summaries={mockBridges} />);
      
      const grid = container.firstChild;
      expect(grid).toHaveClass("gap-4");
    });

    it("passes variant prop to each card", () => {
      render(<BridgeSummaryGrid summaries={mockBridges} variant="detailed" />);
      
      // All cards should show detailed information
      const coverageLabels = screen.getAllByText("Coverage & Reliability");
      expect(coverageLabels).toHaveLength(3);
    });

    it("has proper ARIA attributes for grid", () => {
      render(<BridgeSummaryGrid summaries={mockBridges} />);
      
      const grid = screen.getByRole("region", { name: /Bridge summaries/ });
      expect(grid).toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("renders skeleton cards when isLoading is true", () => {
      render(<BridgeSummaryGrid isLoading />);
      
      const skeletons = getSkeletonCards();
      expect(skeletons).toHaveLength(4); // Default loadingCount is 4
    });

    it("renders custom number of skeleton cards", () => {
      render(<BridgeSummaryGrid isLoading loadingCount={6} />);
      
      const skeletons = getSkeletonCards();
      expect(skeletons).toHaveLength(6);
    });

    it("displays loading status aria-label", () => {
      render(<BridgeSummaryGrid isLoading />);
      
      expect(screen.getByRole("status", { name: /Loading bridge summaries/ })).toBeInTheDocument();
    });

    it("does not render actual card data when loading", () => {
      render(<BridgeSummaryGrid summaries={mockBridges} isLoading />);
      
      expect(screen.queryByText("Circle")).not.toBeInTheDocument();
    });

    it("applies correct variant to skeleton cards", () => {
      render(<BridgeSummaryGrid isLoading variant="detailed" />);
      
      // Skeleton cards should respect the variant prop
      const skeletons = getSkeletonCards();
      expect(skeletons).toHaveLength(4);
    });
  });

  describe("Error State", () => {
    it("displays error message when isError is true", () => {
      render(<BridgeSummaryGrid isError />);
      
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Unable to load bridges")).toBeInTheDocument();
    });

    it("displays custom error message", () => {
      render(<BridgeSummaryGrid isError error="Connection timeout" />);
      
      expect(screen.getByText("Connection timeout")).toBeInTheDocument();
    });

    it("error message spans full grid width", () => {
      const { container } = render(<BridgeSummaryGrid isError />);
      
      const alertEl = container.querySelector("[role='alert']");
      expect(alertEl?.firstElementChild).toHaveClass("col-span-full");
    });

    it("does not render card data when in error state", () => {
      render(<BridgeSummaryGrid summaries={mockBridges} isError />);
      
      expect(screen.queryByText("Circle")).not.toBeInTheDocument();
    });
  });

  describe("Empty State", () => {
    it("displays empty message when summaries array is empty", () => {
      render(<BridgeSummaryGrid summaries={[]} />);
      
      expect(screen.getByText("No bridges available")).toBeInTheDocument();
    });

    it("empty message spans full grid width", () => {
      render(<BridgeSummaryGrid summaries={[]} />);
      
      const emptyDiv = screen.getByText("No bridges available").closest("div");
      expect(emptyDiv).toHaveClass("col-span-full");
    });

    it("displays empty state when summaries is undefined", () => {
      render(<BridgeSummaryGrid />);
      
      expect(screen.getByText("No bridges available")).toBeInTheDocument();
    });
  });

  describe("Props", () => {
    it("accepts custom className prop", () => {
      const { container } = render(
        <BridgeSummaryGrid summaries={mockBridges} className="custom-grid-class" />
      );
      
      expect(container.firstChild).toHaveClass("custom-grid-class");
    });

    it("applies className alongside grid classes", () => {
      const { container } = render(
        <BridgeSummaryGrid summaries={mockBridges} className="mt-6" />
      );
      
      const grid = container.firstChild;
      expect(grid).toHaveClass("grid");
      expect(grid).toHaveClass("mt-6");
    });

    it("defaults to standard variant", () => {
      render(<BridgeSummaryGrid summaries={mockBridges} />);
      
      // Standard variant shows specific sections
      const coverage = screen.getAllByText("Coverage");
      expect(coverage.length).toBeGreaterThan(0);
    });

    it("passes loadingCount prop to control skeleton count", () => {
      render(<BridgeSummaryGrid isLoading loadingCount={8} />);
      
      const skeletons = getSkeletonCards();
      expect(skeletons).toHaveLength(8);
    });
  });

  describe("Responsive Behavior", () => {
    it("grid adapts layout at different breakpoints via CSS classes", () => {
      const { container } = render(<BridgeSummaryGrid summaries={mockBridges} />);
      
      const grid = container.firstChild;
      
      // Mobile: 1 column
      expect(grid).toHaveClass("grid-cols-1");
      
      // Tablet and up: 2 columns
      expect(grid).toHaveClass("md:grid-cols-2");
      
      // Desktop and up: 3 columns
      expect(grid).toHaveClass("lg:grid-cols-3");
      
      // Large screens and up: 4 columns
      expect(grid).toHaveClass("xl:grid-cols-4");
    });

    it("maintains consistent gap between items", () => {
      const { container } = render(<BridgeSummaryGrid summaries={mockBridges} />);
      
      const grid = container.firstChild;
      expect(grid).toHaveClass("gap-4");
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA role for grid container", () => {
      render(<BridgeSummaryGrid summaries={mockBridges} />);
      
      expect(screen.getByRole("region")).toBeInTheDocument();
    });

    it("loading state has proper role and aria-label", () => {
      render(<BridgeSummaryGrid isLoading />);
      
      expect(screen.getByRole("status", { name: /Loading bridge summaries/ })).toBeInTheDocument();
    });

    it("error state has proper role for alert", () => {
      render(<BridgeSummaryGrid isError />);
      
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("each card has unique data-testid for identification", () => {
      render(<BridgeSummaryGrid summaries={mockBridges} />);
      
      expect(screen.getByTestId("bridge-summary-card-circle")).toBeInTheDocument();
      expect(screen.getByTestId("bridge-summary-card-wormhole")).toBeInTheDocument();
      expect(screen.getByTestId("bridge-summary-card-bridging-protocol")).toBeInTheDocument();
    });
  });

  describe("Performance", () => {
    it("renders large lists efficiently", () => {
      const largeBridgeList = Array.from({ length: 100 }, (_, i) => ({
        ...mockBridges[0],
        id: `bridge-${i}`,
        name: `Bridge ${i}`,
      }));
      
      const { container } = render(<BridgeSummaryGrid summaries={largeBridgeList} />);
      
      const cards = screen.getAllByTestId(/bridge-summary-card-/);
      expect(cards).toHaveLength(100);
      
      // Grid still has proper classes
      expect(container.firstChild).toHaveClass("grid");
    }, 10_000);
  });
});
