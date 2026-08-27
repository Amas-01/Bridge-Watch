import { describe, it, expect, beforeEach } from "vitest";
import { HolderDistributionService } from "../holderDistribution.service.js";

describe("HolderDistributionService (#1154)", () => {
  let service: HolderDistributionService;

  beforeEach(() => {
    service = new HolderDistributionService();
  });

  it("should calculate correct Gini coefficient for equal and unequal balances", () => {
    // Equal distribution -> Gini should be 0
    const equalGini = service.calculateGiniCoefficient([100, 100, 100, 100]);
    expect(equalGini).toBe(0);

    // Highly skewed distribution -> Gini should be close to 1
    const skewedGini = service.calculateGiniCoefficient([1, 1, 1, 100000]);
    expect(skewedGini).toBeGreaterThan(0.7);
  });

  it("should record and query holder distribution snapshot", async () => {
    const balances = [1000, 500, 200, 100, 50, 50, 20, 10, 10, 10]; // Total: 1950
    const snapshot = await service.recordSnapshot("0xTOKEN_A", "stellar", balances);

    expect(snapshot.totalHolders).toBe(10);
    expect(snapshot.totalSupply).toBe("1950");
    expect(snapshot.concentration.top1PctShare).toBeGreaterThan(0);
    expect(snapshot.tierDistribution.whalesPct).toBeGreaterThan(0);

    const latest = await service.getLatestSnapshot("0xTOKEN_A", "stellar");
    expect(latest?.id).toBe(snapshot.id);
  });
});
