import { describe, it, expect } from "vitest";
import {
  LiquidityHeatmapExportService,
  type LiquiditySnapshotRow,
} from "../../src/services/liquidityHeatmapExport.service.js";

describe("LiquidityHeatmapExportService", () => {
  const service = new LiquidityHeatmapExportService();

  const rows: LiquiditySnapshotRow[] = [
    { time: "2026-08-01T01:15:00.000Z", symbol: "USDC", dex: "StellarX", tvl_usd: 100 },
    { time: "2026-08-01T01:45:00.000Z", symbol: "USDC", dex: "StellarX", tvl_usd: 50 },
    { time: "2026-08-01T01:30:00.000Z", symbol: "USDC", dex: "Soroswap", tvl_usd: 25 },
    { time: "2026-08-02T05:00:00.000Z", symbol: "EURC", dex: "StellarX", tvl_usd: 10 },
  ];

  describe("buildHeatmap", () => {
    it("buckets rows by day by default and sums TVL per symbol/bucket", () => {
      const heatmap = service.buildHeatmap(rows);

      expect(heatmap.interval).toBe("day");
      expect(heatmap.axis.buckets).toEqual(["2026-08-01", "2026-08-02"]);
      expect(heatmap.axis.symbols).toEqual(["EURC", "USDC"]);
      expect(heatmap.matrix.USDC["2026-08-01"]).toBe(175);
      expect(heatmap.matrix.EURC["2026-08-02"]).toBe(10);
    });

    it("buckets rows by hour when requested, keeping dexes separate as cells", () => {
      const heatmap = service.buildHeatmap(rows, { interval: "hour" });

      expect(heatmap.axis.buckets).toEqual([
        "2026-08-01T01:00:00.000Z",
        "2026-08-02T05:00:00.000Z",
      ]);
      // All three USDC rows fall in the same hour bucket, across two dexes.
      const usdcCells = heatmap.cells.filter((c) => c.symbol === "USDC");
      expect(usdcCells).toHaveLength(2);
      expect(heatmap.matrix.USDC["2026-08-01T01:00:00.000Z"]).toBe(175);
    });

    it("returns an empty heatmap for no rows", () => {
      const heatmap = service.buildHeatmap([]);
      expect(heatmap.axis.buckets).toEqual([]);
      expect(heatmap.cells).toEqual([]);
      expect(heatmap.matrix).toEqual({});
    });
  });

  describe("toCsv", () => {
    it("renders a symbol x bucket matrix with zero-filled gaps", () => {
      const heatmap = service.buildHeatmap(rows);
      const csv = service.toCsv(heatmap);
      const lines = csv.split("\n");

      expect(lines[0]).toBe("symbol,2026-08-01,2026-08-02");
      const eurcRow = lines.find((l) => l.startsWith("EURC"));
      expect(eurcRow).toBe("EURC,0,10");
    });
  });
});
