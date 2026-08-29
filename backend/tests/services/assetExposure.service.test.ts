import { describe, it, expect } from "vitest";
import { assetExposureService } from "../../src/services/assetExposure.service.js";

describe("AssetExposureService", () => {
  it("calculates concentration exposure summary and HHI score", async () => {
    const summary = await assetExposureService.getSummary();
    expect(summary).toBeDefined();
    expect(summary.totalExposureUsd).toBeGreaterThan(0);
    expect(summary.hhiScore).toBeGreaterThanOrEqual(0);
    expect(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).toContain(summary.riskLevel);
  });

  it("returns detailed breakdown for chains, bridges, and custodians", async () => {
    const breakdown = await assetExposureService.getBreakdown();
    expect(breakdown.chains.length).toBeGreaterThan(0);
    expect(breakdown.bridges.length).toBeGreaterThan(0);
    expect(breakdown.custodians.length).toBeGreaterThan(0);
  });

  it("updates and retrieves rebalance alert configuration", async () => {
    const updated = await assetExposureService.updateAlertConfig({
      maxChainConcentrationPct: 50,
    });
    expect(updated.maxChainConcentrationPct).toBe(50);
  });
});
