import { describe, it, expect } from "vitest";
import { BridgeComparisonReportService } from "../../src/services/bridgeComparisonReport.service.js";
import type { BridgeStats } from "../../src/services/bridge.service.js";

function makeStats(overrides: Partial<BridgeStats> & { name: string }): BridgeStats {
  return {
    name: overrides.name,
    totalValueLocked: 0,
    supplyOnStellar: 0,
    supplyOnSource: 0,
    status: "healthy",
    volume24h: 0,
    volume7d: 0,
    volume30d: 0,
    totalTransactions: 0,
    averageTransferTime: 0,
    uptime30d: 100,
    ...overrides,
  };
}

describe("BridgeComparisonReportService", () => {
  const service = new BridgeComparisonReportService();

  describe("buildReport", () => {
    it("returns an empty report when no bridges are provided", () => {
      const report = service.buildReport([]);

      expect(report.bridges).toEqual([]);
      expect(report.summary).toEqual({
        bridgeCount: 0,
        combinedTvl: 0,
        combinedVolume30d: 0,
        combinedTransactions: 0,
        bestTvl: null,
        bestUptime: null,
        fastestTransfer: null,
      });
    });

    it("ranks bridges by TVL, uptime, and transfer speed independently", () => {
      const stats = [
        makeStats({ name: "Wormhole", totalValueLocked: 100, uptime30d: 90, averageTransferTime: 120 }),
        makeStats({ name: "Allbridge", totalValueLocked: 300, uptime30d: 99, averageTransferTime: 60 }),
        makeStats({ name: "Circle", totalValueLocked: 200, uptime30d: 95, averageTransferTime: 30 }),
      ];

      const report = service.buildReport(stats);
      const byName = Object.fromEntries(report.bridges.map((b) => [b.name, b]));

      expect(byName.Allbridge.tvlRank).toBe(1);
      expect(byName.Circle.tvlRank).toBe(2);
      expect(byName.Wormhole.tvlRank).toBe(3);

      expect(byName.Allbridge.uptimeRank).toBe(1);
      expect(byName.Circle.transferSpeedRank).toBe(1);

      expect(report.summary.bestTvl).toBe("Allbridge");
      expect(report.summary.bestUptime).toBe("Allbridge");
      expect(report.summary.fastestTransfer).toBe("Circle");
    });

    it("computes tvlShare proportional to combined TVL", () => {
      const stats = [
        makeStats({ name: "A", totalValueLocked: 100 }),
        makeStats({ name: "B", totalValueLocked: 300 }),
      ];

      const report = service.buildReport(stats);
      const byName = Object.fromEntries(report.bridges.map((b) => [b.name, b]));

      expect(byName.A.tvlShare).toBeCloseTo(0.25);
      expect(byName.B.tvlShare).toBeCloseTo(0.75);
      expect(report.summary.combinedTvl).toBe(400);
    });

    it("sorts the bridges array by TVL rank ascending", () => {
      const stats = [
        makeStats({ name: "Low", totalValueLocked: 10 }),
        makeStats({ name: "High", totalValueLocked: 1000 }),
        makeStats({ name: "Mid", totalValueLocked: 100 }),
      ];

      const report = service.buildReport(stats);
      expect(report.bridges.map((b) => b.name)).toEqual(["High", "Mid", "Low"]);
    });
  });

  describe("toCsv", () => {
    it("renders a header row followed by one row per bridge", () => {
      const report = service.buildReport([
        makeStats({ name: "Wormhole", totalValueLocked: 100 }),
        makeStats({ name: "Allbridge", totalValueLocked: 200 }),
      ]);

      const csv = service.toCsv(report);
      const lines = csv.split("\n");

      expect(lines[0]).toContain("name");
      expect(lines).toHaveLength(3);
      expect(lines[1]).toContain("Allbridge");
    });
  });
});
