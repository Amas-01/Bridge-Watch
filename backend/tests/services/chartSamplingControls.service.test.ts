import { describe, it, expect } from "vitest";
import { ChartDataSampler, type ChartDataPoint } from "../../src/services/chartSamplingControls.service.js";

function generateSeries(count: number): ChartDataPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    timestamp: i * 1000,
    value: Math.sin(i / 10) * 100 + i,
  }));
}

describe("ChartDataSampler", () => {
  describe("input validation", () => {
    it("rejects a maxPoints of 0", () => {
      expect(() => ChartDataSampler.nthPoint(generateSeries(10), 0)).toThrow("maxPoints");
    });

    it("rejects a non-integer maxPoints", () => {
      expect(() => ChartDataSampler.fixedInterval(generateSeries(10), 2.5)).toThrow("maxPoints");
    });

    it("rejects maxPoints above the allowed ceiling", () => {
      expect(() => ChartDataSampler.minMax(generateSeries(10), 1_000_000)).toThrow("maxPoints");
    });
  });

  describe("nthPoint", () => {
    it("returns the original series untouched when already within budget", () => {
      const points = generateSeries(50);
      expect(ChartDataSampler.nthPoint(points, 100)).toEqual(points);
    });

    it("downsamples to exactly maxPoints and preserves first/last points", () => {
      const points = generateSeries(1000);
      const sampled = ChartDataSampler.nthPoint(points, 100);

      expect(sampled).toHaveLength(100);
      expect(sampled[0]).toEqual(points[0]);
      expect(sampled[sampled.length - 1]).toEqual(points[points.length - 1]);
    });
  });

  describe("fixedInterval", () => {
    it("produces at most maxPoints buckets", () => {
      const points = generateSeries(1000);
      const sampled = ChartDataSampler.fixedInterval(points, 50);
      expect(sampled.length).toBeLessThanOrEqual(50);
    });

    it("averages values within each bucket", () => {
      const points: ChartDataPoint[] = [
        { timestamp: 0, value: 10 },
        { timestamp: 1, value: 20 },
      ];
      const sampled = ChartDataSampler.fixedInterval(points, 1);
      expect(sampled).toHaveLength(1);
      expect(sampled[0].value).toBe(15);
    });
  });

  describe("minMax", () => {
    it("captures a spike that fixed-interval bucketing could smooth away", () => {
      const points: ChartDataPoint[] = generateSeries(100).map((p, i) =>
        i === 50 ? { ...p, value: 100000 } : { ...p, value: 0 }
      );

      const sampled = ChartDataSampler.minMax(points, 20);
      expect(sampled.some((p) => p.value === 100000)).toBe(true);
    });

    it("returns at most maxPoints entries", () => {
      const points = generateSeries(500);
      const sampled = ChartDataSampler.minMax(points, 40);
      expect(sampled.length).toBeLessThanOrEqual(40);
    });
  });

  describe("lttb", () => {
    it("always keeps the first and last point", () => {
      const points = generateSeries(1000);
      const sampled = ChartDataSampler.lttb(points, 50);

      expect(sampled[0]).toEqual(points[0]);
      expect(sampled[sampled.length - 1]).toEqual(points[points.length - 1]);
    });

    it("returns the original series when it is already within budget", () => {
      const points = generateSeries(10);
      expect(ChartDataSampler.lttb(points, 100)).toEqual(points);
    });

    it("produces exactly maxPoints points for a larger series", () => {
      const points = generateSeries(2000);
      const sampled = ChartDataSampler.lttb(points, 200);
      expect(sampled).toHaveLength(200);
    });
  });

  describe("sample dispatcher", () => {
    it("throws on an unsupported strategy", () => {
      expect(() =>
        ChartDataSampler.sample(generateSeries(10), "unknown" as any, 5)
      ).toThrow("Unsupported sampling strategy");
    });

    it("dispatches to the correct algorithm for each strategy", () => {
      const points = generateSeries(100);
      expect(ChartDataSampler.sample(points, "lttb", 10)).toHaveLength(10);
      expect(ChartDataSampler.sample(points, "nth_point", 10)).toHaveLength(10);
    });
  });
});
