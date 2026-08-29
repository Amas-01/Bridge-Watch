import { describe, expect, it } from "vitest";
import { calculateBaselineDeviation } from "../../src/services/anomalyDetection.service.js";

describe("anomaly baseline tuning", () => {
  it("calculates the rolling mean and deviation score", () => {
    const result = calculateBaselineDeviation([8, 10, 12], 14);

    expect(result?.mean).toBe(10);
    expect(result?.standardDeviation).toBeCloseTo(1.633, 3);
    expect(result?.score).toBeCloseTo(2.449, 3);
  });

  it("waits for at least three observations", () => {
    expect(calculateBaselineDeviation([10, 12], 20)).toBeNull();
  });

  it("does not flag a constant baseline with zero variance", () => {
    expect(calculateBaselineDeviation([10, 10, 10], 12)).toBeNull();
  });
});
