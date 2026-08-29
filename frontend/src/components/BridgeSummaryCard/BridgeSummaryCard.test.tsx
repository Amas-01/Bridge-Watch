import { describe, it, expect, vi } from "vitest";
import { render, screen } from "../../test/utils";
import BridgeSummaryCard from "./BridgeSummaryCard";
import type { BridgeSummary } from "../../types";
import type { AnchorHTMLAttributes, ReactNode } from "react";

// Mock react-router-dom Link to avoid navigation in tests
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode; to: string }) => (
      <a href={to} {...props}>{children}</a>
    ),
  };
});

const mockBridgeSummary: BridgeSummary = {
  id: "circle-bridge",
  name: "Circle",
  status: "healthy",
  coverage: 99.5,
  performance: 234.5,
  totalValueLocked: 500_000_000,
  supplyOnStellar: 400_000_000,
  supplyOnSource: 400_000_000,
  mismatchPercentage: 0,
  lastUpdated: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
};

const degradedBridge: BridgeSummary = {
  ...mockBridgeSummary,
  id: "wormhole-bridge",
  name: "Wormhole",
  status: "degraded",
  coverage: 95.2,
  performance: 450.8,
  totalValueLocked: 200_000_000,
  supplyOnStellar: 180_000_000,
  supplyOnSource: 190_000_000,
  mismatchPercentage: 5.26,
};

const downBridge: BridgeSummary = {
  ...mockBridgeSummary,
  id: "down-bridge",
  name: "Down Bridge",
  status: "down",
  coverage: 0,
  performance: 9999,
};

describe("BridgeSummaryCard", () => {
  describe("Standard Variant", () => {
    it("renders bridge name and status badge", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="standard" />);
      
      expect(screen.getByText("Circle")).toBeInTheDocument();
      expect(screen.getByText("Healthy")).toBeInTheDocument();
    });

    it("renders coverage metric with accessible label", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="standard" />);
      
      expect(screen.getByText("Uptime")).toBeInTheDocument();
      const uptime = screen.getByLabelText(/Uptime: 99.5%/);
      expect(uptime).toBeInTheDocument();
    });

    it("renders performance metric with accessible label", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="standard" />);
      
      expect(screen.getByText("Avg Transfer Time")).toBeInTheDocument();
      const performance = screen.getByLabelText(/Avg Transfer Time: 235 ms/);
      expect(performance).toBeInTheDocument();
    });

    it("renders TVL with correct formatting", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="standard" />);
      
      expect(screen.getByLabelText(/TVL: \$500.00M/)).toBeInTheDocument();
    });

    it("renders last updated timestamp", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="standard" />);
      
      expect(screen.getByText(/Updated .* ago/)).toBeInTheDocument();
    });

    it("renders as a link with correct href", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="standard" />);
      
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/bridges?selected=Circle");
    });

    it("displays degraded status with yellow styling", () => {
      render(<BridgeSummaryCard summary={degradedBridge} variant="standard" />);
      
      expect(screen.getByText("Degraded")).toBeInTheDocument();
      expect(screen.getByLabelText("Status: Degraded")).toHaveClass("text-status-warning");
    });

    it("displays down status with red styling", () => {
      render(<BridgeSummaryCard summary={downBridge} variant="standard" />);
      
      expect(screen.getByText("Down")).toBeInTheDocument();
      expect(screen.getByLabelText("Status: Down")).toHaveClass("text-status-danger");
    });

    it("displays mismatch percentage with appropriate color", () => {
      render(<BridgeSummaryCard summary={degradedBridge} variant="standard" />);
      
      // Will show in detailed variant, so let's test detailed for mismatch
    });
  });

  describe("Compact Variant", () => {
    it("renders only name and status", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="compact" />);
      
      expect(screen.getByText("Circle")).toBeInTheDocument();
      expect(screen.getByText("Healthy")).toBeInTheDocument();
    });

    it("does not render coverage metric", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="compact" />);
      
      // Check that detailed sections are not present
      expect(screen.queryByText("Coverage")).not.toBeInTheDocument();
    });

    it("does not render performance metric", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="compact" />);
      
      expect(screen.queryByText("Performance")).not.toBeInTheDocument();
    });

    it("does not render TVL section", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="compact" />);
      
      expect(screen.queryByText("Value")).not.toBeInTheDocument();
    });

    it("renders as a link", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="compact" />);
      
      const link = screen.getByRole("link");
      expect(link).toBeInTheDocument();
    });
  });

  describe("Detailed Variant", () => {
    it("renders all sections", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="detailed" />);
      
      expect(screen.getByText("Circle")).toBeInTheDocument();
      expect(screen.getByText("Coverage & Reliability")).toBeInTheDocument();
      expect(screen.getByText("Performance Metrics")).toBeInTheDocument();
      expect(screen.getByText("Assets & Liquidity")).toBeInTheDocument();
    });

    it("renders uptime with accessible label", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="detailed" />);
      
      expect(screen.getByLabelText(/Uptime \(30d\): 99.5%/)).toBeInTheDocument();
    });

    it("renders supply metrics", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="detailed" />);
      
      expect(screen.getByLabelText(/Supply \(Stellar\):/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Supply \(Source\):/)).toBeInTheDocument();
    });

    it("renders mismatch percentage with color based on value", () => {
      render(<BridgeSummaryCard summary={degradedBridge} variant="detailed" />);
      
      const mismatch = screen.getByLabelText(/Supply mismatch: 5.26%/);
      expect(mismatch).toHaveClass("text-status-danger");
    });

    it("renders mismatch in green when below 0.5%", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="detailed" />);
      
      const mismatch = screen.getByLabelText(/Supply mismatch: 0.00%/);
      expect(mismatch).toHaveClass("text-status-success");
    });

    it("renders mismatch in yellow when 0.5-1%", () => {
      const bridge: BridgeSummary = {
        ...mockBridgeSummary,
        mismatchPercentage: 0.8,
      };
      render(<BridgeSummaryCard summary={bridge} variant="detailed" />);
      
      const mismatch = screen.getByLabelText(/Supply mismatch: 0.80%/);
      expect(mismatch).toHaveClass("text-status-warning");
    });
  });

  describe("Loading State", () => {
    it("renders skeleton when isLoading is true", () => {
      render(<BridgeSummaryCard isLoading />);
      
      const skeleton = screen.getByLabelText("Loading bridge summary");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("aria-busy", "true");
    });

    it("renders with aria-busy for accessibility", () => {
      render(<BridgeSummaryCard isLoading />);
      
      const skeleton = screen.getByRole("status", { name: /loading bridge summary/i });
      expect(skeleton).toHaveAttribute("aria-busy", "true");
    });

    it("does not render card content when loading", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} isLoading />);
      
      expect(screen.queryByText("Circle")).not.toBeInTheDocument();
    });
  });

  describe("Error State", () => {
    it("renders error state when isError is true", () => {
      render(<BridgeSummaryCard isError />);
      
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText("Unable to load bridge summary")).toBeInTheDocument();
    });

    it("displays custom error message", () => {
      render(
        <BridgeSummaryCard isError error="Network connection failed" />
      );
      
      expect(screen.getByText("Network connection failed")).toBeInTheDocument();
    });

    it("renders error state when summary is undefined", () => {
      render(<BridgeSummaryCard summary={undefined} />);
      
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("does not render card content when in error state", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} isError />);
      
      expect(screen.queryByText("Circle")).not.toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("has proper ARIA labels for numeric metrics", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="standard" />);
      
      // Uptime metric has aria-label
      expect(screen.getByLabelText(/Uptime:/)).toBeInTheDocument();
      
      // Performance metric has aria-label
      expect(screen.getByLabelText(/Avg Transfer Time:/)).toBeInTheDocument();
      
      // TVL has aria-label
      expect(screen.getByLabelText(/TVL:/)).toBeInTheDocument();
    });

    it("status indicator has non-colour representation", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="standard" />);
      
      // Status badge has both text and aria-label
      const statusBadge = screen.getByLabelText("Status: Healthy");
      expect(statusBadge).toHaveTextContent("Healthy");
    });

    it("link has descriptive aria-label", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="standard" />);
      
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("aria-label", expect.stringContaining("bridge"));
    });

    it("metrics include units in accessible name", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="standard" />);
      
      // Uptime should include %
      expect(screen.getByLabelText(/99.5%/)).toBeInTheDocument();
      
      // Transfer time should include ms
      expect(screen.getByLabelText(/235 ms/)).toBeInTheDocument();
    });
  });

  describe("Props", () => {
    it("accepts className prop", () => {
      const { container } = render(
        <BridgeSummaryCard summary={mockBridgeSummary} className="custom-class" />
      );
      
      expect(container.firstChild).toHaveClass("custom-class");
    });

    it("accepts data-testid prop", () => {
      render(
        <BridgeSummaryCard
          summary={mockBridgeSummary}
          data-testid="custom-test-id"
        />
      );
      
      expect(screen.getByTestId("custom-test-id")).toBeInTheDocument();
    });

    it("defaults to standard variant if not specified", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} />);
      
      // Standard variant shows coverage and performance
      expect(screen.getByText("Coverage")).toBeInTheDocument();
      expect(screen.getByText("Performance")).toBeInTheDocument();
    });
  });

  describe("Formatting", () => {
    it("formats large TVL values correctly", () => {
      const largeTVL: BridgeSummary = {
        ...mockBridgeSummary,
        totalValueLocked: 1_200_000_000,
      };
      render(<BridgeSummaryCard summary={largeTVL} variant="standard" />);
      
      expect(screen.getByLabelText(/\$1.20B/)).toBeInTheDocument();
    });

    it("formats small TVL values correctly", () => {
      const smallTVL: BridgeSummary = {
        ...mockBridgeSummary,
        totalValueLocked: 500_000,
      };
      render(<BridgeSummaryCard summary={smallTVL} variant="standard" />);
      
      expect(screen.getByLabelText(/\$500.00K/)).toBeInTheDocument();
    });

    it("formats supply numbers with thousands separator", () => {
      render(<BridgeSummaryCard summary={mockBridgeSummary} variant="detailed" />);
      
      expect(screen.getAllByLabelText(/400,000,000 units/)).toHaveLength(2);
    });

    it("formats recent timestamps as 'just now'", () => {
      const recentBridge: BridgeSummary = {
        ...mockBridgeSummary,
        lastUpdated: new Date().toISOString(),
      };
      render(<BridgeSummaryCard summary={recentBridge} variant="standard" />);
      
      expect(screen.getByText(/just now/)).toBeInTheDocument();
    });
  });
});
