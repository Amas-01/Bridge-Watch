import { describe, it, expect } from "vitest";
import {
  computePriceImpactPct,
  evaluateScenario,
  severityFor,
} from "../../src/services/marketImpactPresets.service.js";

const preset = (tradeSizeUsd: number, slippageTolerancePct = 1) => ({
  id: "preset-1",
  name: "Desk",
  tradeSizeUsd,
  slippageTolerancePct,
});

const pool = (liquidityUsd: number, fee = 0.003) => ({
  poolKey: "p1",
  dex: "StellarX",
  pair: "USDC/XLM",
  liquidityUsd,
  fee,
});

describe("market impact model (#1159)", () => {
  it("grows impact with trade size against a fixed pool", () => {
    const small = computePriceImpactPct(1_000, 1_000_000);
    const large = computePriceImpactPct(100_000, 1_000_000);

    expect(small).toBeLessThan(large);
  });

  it("shrinks impact as the pool deepens for a fixed trade", () => {
    const shallow = computePriceImpactPct(50_000, 100_000);
    const deep = computePriceImpactPct(50_000, 100_000_000);

    expect(deep).toBeLessThan(shallow);
  });

  it("stays bounded below 100% even for a trade far larger than the pool", () => {
    const impact = computePriceImpactPct(1_000_000_000, 1_000);

    expect(impact).toBeLessThan(100);
    expect(impact).toBeGreaterThan(99);
  });

  it("treats an empty pool as total impact rather than dividing by zero", () => {
    expect(computePriceImpactPct(1_000, 0)).toBe(100);
    expect(Number.isFinite(computePriceImpactPct(1_000, 0))).toBe(true);
  });

  it("adds the pool fee on top of impact to get effective slippage", () => {
    const result = evaluateScenario(preset(1_000), pool(10_000_000, 0.003));

    expect(result.effectiveSlippagePct).toBeCloseTo(result.priceImpactPct + 0.3, 4);
  });

  it("flags a scenario that breaches the preset's tolerance", () => {
    const within = evaluateScenario(preset(1_000, 1), pool(50_000_000));
    const breaching = evaluateScenario(preset(1_000_000, 1), pool(1_000_000));

    expect(within.withinTolerance).toBe(true);
    expect(breaching.withinTolerance).toBe(false);
    expect(breaching.severity).toBe("severe");
  });

  it("reports the trade as a share of pool depth", () => {
    const result = evaluateScenario(preset(250_000), pool(1_000_000));

    expect(result.tradeSharePct).toBeCloseTo(25, 6);
  });

  it("prices the cost of the scenario in USD", () => {
    const result = evaluateScenario(preset(100_000), pool(10_000_000, 0.003));

    expect(result.estimatedCostUsd).toBeCloseTo(
      (100_000 * result.effectiveSlippagePct) / 100,
      2
    );
  });

  it("bands severity by effective slippage", () => {
    expect(severityFor(0.1)).toBe("low");
    expect(severityFor(1)).toBe("moderate");
    expect(severityFor(5)).toBe("high");
    expect(severityFor(25)).toBe("severe");
  });
});
