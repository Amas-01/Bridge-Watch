import { describe, it, expect } from "vitest";
import {
  scorePool,
  toGrade,
  QUALITY_WEIGHTS,
  type PoolQualityInput,
} from "../../src/services/poolQualityRanking.service.js";

const NOW = new Date("2026-08-28T12:00:00Z");

const input = (overrides: Partial<PoolQualityInput> = {}): PoolQualityInput => ({
  poolKey: "p1",
  dex: "StellarX",
  totalLiquidity: 1_000_000,
  volume24h: 100_000,
  fee: 0.003,
  healthScore: 80,
  lastUpdated: NOW,
  ...overrides,
});

describe("pool quality scoring (#1158)", () => {
  it("weights sum to 1 so the total stays on the 0-100 component scale", () => {
    const sum = Object.values(QUALITY_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("scores a deep, active, cheap, healthy, fresh pool near the top", () => {
    const result = scorePool(
      input({
        totalLiquidity: 20_000_000,
        volume24h: 12_000_000,
        fee: 0,
        healthScore: 100,
      }),
      NOW
    );

    expect(result.totalScore).toBeGreaterThan(85);
    expect(result.grade).toBe("A");
  });

  it("scores an empty pool at the bottom without producing NaN", () => {
    const result = scorePool(
      input({ totalLiquidity: 0, volume24h: 0, healthScore: 0, fee: 0.01 }),
      NOW
    );

    expect(Number.isFinite(result.totalScore)).toBe(true);
    expect(result.depthScore).toBe(0);
    expect(result.volumeScore).toBe(0);
    expect(result.feeScore).toBe(0);
    expect(result.grade).toBe("F");
  });

  it("rewards depth on a log curve, not linearly", () => {
    const small = scorePool(input({ totalLiquidity: 10_000 }), NOW).depthScore;
    const mid = scorePool(input({ totalLiquidity: 100_000 }), NOW).depthScore;
    const large = scorePool(input({ totalLiquidity: 1_000_000 }), NOW).depthScore;

    expect(small).toBeLessThan(mid);
    expect(mid).toBeLessThan(large);
    // A tenfold jump low down is worth roughly as much as one higher up — that
    // is what keeps mid-sized pools from collapsing to zero.
    expect(mid - small).toBeCloseTo(large - mid, 1);
  });

  it("caps every component at 100 however extreme the input", () => {
    const result = scorePool(
      input({ totalLiquidity: 1e12, volume24h: 1e12, healthScore: 500, fee: -1 }),
      NOW
    );

    for (const value of [
      result.depthScore,
      result.volumeScore,
      result.feeScore,
      result.stabilityScore,
      result.freshnessScore,
    ]) {
      expect(value).toBeLessThanOrEqual(100);
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(result.totalScore).toBeLessThanOrEqual(100);
  });

  it("decays freshness towards zero as the snapshot ages", () => {
    const fresh = scorePool(input(), NOW).freshnessScore;
    const halfDay = scorePool(
      input({ lastUpdated: new Date(NOW.getTime() - 12 * 3600 * 1000) }),
      NOW
    ).freshnessScore;
    const twoDays = scorePool(
      input({ lastUpdated: new Date(NOW.getTime() - 48 * 3600 * 1000) }),
      NOW
    ).freshnessScore;

    expect(fresh).toBe(100);
    expect(halfDay).toBeCloseTo(50, 0);
    expect(twoDays).toBe(0);
  });

  it("maps scores onto grade boundaries", () => {
    expect(toGrade(90)).toBe("A");
    expect(toGrade(85)).toBe("A");
    expect(toGrade(84.99)).toBe("B");
    expect(toGrade(70)).toBe("B");
    expect(toGrade(55)).toBe("C");
    expect(toGrade(40)).toBe("D");
    expect(toGrade(39.99)).toBe("F");
  });
});
