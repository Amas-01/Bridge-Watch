import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import HealthScoreCard from "./HealthScoreCard";
import type { HealthFactors } from "../types";

const mockFactors: HealthFactors = {
  liquidityDepth: 85,
  priceStability: 90,
  bridgeUptime: 95,
  reserveBacking: 88,
  volumeTrend: 82,
};

describe("HealthScoreCard", () => {
  describe("Component Rendering", () => {
    it("should render skeleton when data is null", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          name="USD Coin"
          overallScore={null}
          factors={null}
          trend={null}
        />
      );
      expect(screen.getByLabelText(/Loading health data/i)).toBeInTheDocument();
    });

    it("should render health score card when data is provided", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          name="USD Coin"
          overallScore={85}
          factors={mockFactors}
          trend="improving"
        />
      );
      expect(screen.getByText("USDC")).toBeInTheDocument();
      expect(screen.getByText("USD Coin")).toBeInTheDocument();
      expect(screen.getByText("85")).toBeInTheDocument();
    });

    it("should display asset symbol and name", () => {
      render(
        <HealthScoreCard
          symbol="PYUSD"
          name="PayPal USD"
          overallScore={75}
          factors={mockFactors}
          trend="stable"
        />
      );
      expect(screen.getByText("PYUSD")).toBeInTheDocument();
      expect(screen.getByText("PayPal USD")).toBeInTheDocument();
    });
  });

  describe("Health Status Badge", () => {
    it("should show healthy status for score >= 80", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={85}
          factors={mockFactors}
          trend="stable"
        />
      );
      expect(screen.getByText("Healthy")).toBeInTheDocument();
    });

    it("should show warning status for score 50-79", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={65}
          factors={{
            liquidityDepth: 60,
            priceStability: 65,
            bridgeUptime: 70,
            reserveBacking: 60,
            volumeTrend: 65,
          }}
          trend="stable"
        />
      );
      expect(screen.getByText("Warning")).toBeInTheDocument();
    });

    it("should show critical status for score < 50", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={35}
          factors={{
            liquidityDepth: 30,
            priceStability: 35,
            bridgeUptime: 40,
            reserveBacking: 30,
            volumeTrend: 35,
          }}
          trend="deteriorating"
        />
      );
      expect(screen.getByText("Critical")).toBeInTheDocument();
    });
  });

  describe("Health Score Tooltip", () => {
    it("should render tooltip trigger element", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={85}
          factors={mockFactors}
          trend="improving"
        />
      );
      const tooltip = screen.getByRole("status", { name: /Status: Healthy/i });
      expect(tooltip).toBeInTheDocument();
    });

    it("should display breakdown bars for all health factors", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={85}
          factors={mockFactors}
          trend="stable"
          compact={false}
        />
      );
      expect(screen.getByText("Liquidity")).toBeInTheDocument();
      expect(screen.getByText("Price Stability")).toBeInTheDocument();
      expect(screen.getByText("Bridge Uptime")).toBeInTheDocument();
      expect(screen.getByText("Reserve Backing")).toBeInTheDocument();
      expect(screen.getByText("Volume Trend")).toBeInTheDocument();
    });

    it("should display factor scores correctly", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={85}
          factors={mockFactors}
          trend="stable"
          compact={false}
        />
      );
      expect(screen.getByText("85")).toBeInTheDocument();
      expect(screen.getByText("90")).toBeInTheDocument();
      expect(screen.getByText("95")).toBeInTheDocument();
      expect(screen.getByText("88")).toBeInTheDocument();
      expect(screen.getByText("82")).toBeInTheDocument();
    });

    it("should hide factor breakdown in compact mode", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={85}
          factors={mockFactors}
          trend="stable"
          compact={true}
        />
      );
      expect(screen.queryByText("Liquidity")).not.toBeInTheDocument();
    });
  });

  describe("Trend Indicator", () => {
    it("should display improving trend", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={85}
          factors={mockFactors}
          trend="improving"
        />
      );
      expect(screen.getByLabelText("Trend: improving")).toBeInTheDocument();
    });

    it("should display deteriorating trend", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={65}
          factors={{
            liquidityDepth: 60,
            priceStability: 65,
            bridgeUptime: 70,
            reserveBacking: 60,
            volumeTrend: 65,
          }}
          trend="deteriorating"
        />
      );
      expect(screen.getByLabelText("Trend: deteriorating")).toBeInTheDocument();
    });

    it("should display stable trend", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={85}
          factors={mockFactors}
          trend="stable"
        />
      );
      expect(screen.getByLabelText("Trend: stable")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have proper aria labels", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          name="USD Coin"
          overallScore={85}
          factors={mockFactors}
          trend="improving"
        />
      );
      expect(
        screen.getByLabelText(/USDC health score: 85 out of 100/i)
      ).toBeInTheDocument();
    });

    it("should announce factor data via aria attributes", () => {
      render(
        <HealthScoreCard
          symbol="USDC"
          overallScore={85}
          factors={mockFactors}
          trend="stable"
          compact={false}
        />
      );
      const progressBars = screen.getAllByRole("progressbar");
      expect(progressBars.length).toBe(5);
      progressBars.forEach((bar) => {
        expect(bar).toHaveAttribute("aria-valuenow");
        expect(bar).toHaveAttribute("aria-valuemin", "0");
        expect(bar).toHaveAttribute("aria-valuemax", "100");
      });
    });
  });
});
