import { describe, it, expect, beforeEach } from "vitest";
import {
  PortfolioAllocationService,
  type PortfolioPosition,
} from "../../src/services/portfolioAllocation.service.js";

describe("PortfolioAllocationService (#1132)", () => {
  let service: PortfolioAllocationService;

  beforeEach(() => {
    service = new PortfolioAllocationService();
  });

  const positions: PortfolioPosition[] = [
    { assetSymbol: "USDC", chain: "stellar", assetClass: "stablecoin", quantity: 6000, priceUsd: 1 },
    { assetSymbol: "XLM", chain: "stellar", assetClass: "native", quantity: 20000, priceUsd: 0.1 },
    { assetSymbol: "FOBXX", chain: "stellar", assetClass: "rwa", quantity: 20, priceUsd: 100 },
  ];

  it("computes per-position weights that sum to 100 and a total value", () => {
    const view = service.computeAllocation("pf_1", positions);

    expect(view.totalValueUsd).toBe(10000);
    expect(view.positionCount).toBe(3);
    const sum = view.positions.reduce((a, p) => a + p.weightPct, 0);
    expect(sum).toBeCloseTo(100, 1);
    // Positions are returned largest-first.
    expect(view.positions[0].assetSymbol).toBe("USDC");
    expect(view.positions[0].weightPct).toBe(60);
  });

  it("groups allocation by chain and asset class", () => {
    const view = service.computeAllocation("pf_1", positions);

    expect(view.byChain).toEqual([{ key: "stellar", valueUsd: 10000, weightPct: 100 }]);
    const stable = view.byAssetClass.find((s) => s.key === "stablecoin");
    expect(stable?.weightPct).toBe(60);
  });

  it("flags high concentration when one position dominates", () => {
    const view = service.computeAllocation("pf_2", [
      { assetSymbol: "USDC", chain: "stellar", quantity: 9000, priceUsd: 1 },
      { assetSymbol: "XLM", chain: "stellar", quantity: 10000, priceUsd: 0.1 },
    ]);

    expect(view.largestPositionPct).toBe(90);
    expect(view.concentrationRisk).toBe("high");
    expect(view.concentrationFlags.length).toBeGreaterThan(0);
    expect(view.diversificationScore).toBeLessThan(50);
  });

  it("derives drift and rebalance trade sizes from target weights", () => {
    const view = service.computeAllocation("pf_3", [
      { assetSymbol: "USDC", chain: "stellar", quantity: 7000, priceUsd: 1, targetWeightPct: 50 },
      { assetSymbol: "XLM", chain: "stellar", quantity: 30000, priceUsd: 0.1, targetWeightPct: 50 },
    ]);

    const usdc = view.positions.find((p) => p.assetSymbol === "USDC")!;
    expect(usdc.weightPct).toBe(70);
    expect(usdc.driftPct).toBe(20);
    // Target 50% of a $10k book = $5k, currently $7k -> sell $2k.
    expect(usdc.rebalanceActionUsd).toBe(-2000);
  });

  it("stores the latest view for retrieval and rejects bad input", () => {
    expect(service.getAllocation("missing")).toBeNull();
    service.computeAllocation("pf_1", positions);
    expect(service.getAllocation("pf_1")?.portfolioId).toBe("pf_1");

    expect(() => service.computeAllocation("pf_x", [])).toThrow(/at least one position/i);
    expect(() =>
      service.computeAllocation("pf_x", [
        { assetSymbol: "USDC", chain: "stellar", quantity: -1, priceUsd: 1 },
      ]),
    ).toThrow(/invalid quantity/i);
    expect(() =>
      service.computeAllocation("pf_x", [
        { assetSymbol: "USDC", chain: "stellar", quantity: 1, priceUsd: 1, targetWeightPct: 150 },
      ]),
    ).toThrow(/targetWeightPct/i);
  });
});
