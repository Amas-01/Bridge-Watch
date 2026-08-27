import { describe, it, expect, beforeEach } from "vitest";
import { AssetVelocityService } from "../assetVelocity.service.js";

describe("AssetVelocityService (#1155)", () => {
  let service: AssetVelocityService;

  beforeEach(() => {
    service = new AssetVelocityService();
  });

  it("should calculate correct asset velocity and turnover rates", async () => {
    const metric = service.calculateVelocity(
      "USDC",
      "stellar",
      5000000, // 24h Volume
      10000000, // Total Supply (turnover: 0.5)
      2500000, // Active Volume
      8000000, // Circulating Supply (circulation: 0.3125)
      12000, // Total transfers
      4500, // Unique addresses
      "24h",
    );

    expect(metric.turnoverRate).toBe(0.5);
    expect(metric.circulationSpeed).toBe(0.3125);
    expect(metric.velocityScore).toBeGreaterThan(0);
    expect(metric.calculatedAt).toBeDefined();

    const retrieved = await service.getVelocityMetric("USDC", "stellar", "24h");
    expect(retrieved?.assetSymbol).toBe("USDC");
  });
});
