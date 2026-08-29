import { describe, it, expect, vi, beforeEach } from "vitest";
import { trustlineAnalyticsService } from "../../src/services/trustlineAnalytics.service.js";

const mockQuery = vi.fn();

vi.mock("../../src/database/db.js", () => ({
  db: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

describe("trustlineAnalyticsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordSnapshot", () => {
    it("inserts snapshot and concentration records, returning a complete report", async () => {
      // Mock snapshot INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "snap-1",
            assetCode: "FOBXX",
            assetIssuer: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
            totalTrustlines: 1000,
            activeTrustlines: 800,
            totalBalance: "15000000.5000000",
            snapshotAt: new Date(),
            createdAt: new Date(),
          },
        ],
      });

      // Mock concentration metrics INSERTs
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "metric-1",
            snapshotId: "snap-1",
            percentile: "top_10",
            balancePercentage: "65.40",
            createdAt: new Date(),
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "metric-2",
            snapshotId: "snap-1",
            percentile: "top_100",
            balancePercentage: "95.20",
            createdAt: new Date(),
          },
        ],
      });

      const report = await trustlineAnalyticsService.recordSnapshot(
        "FOBXX",
        "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
        1000,
        800,
        15000000.5,
        [
          { percentile: "top_10", balancePercentage: 65.4 },
          { percentile: "top_100", balancePercentage: 95.2 },
        ]
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO trustline_snapshots"),
        expect.any(Array)
      );
      expect(report.snapshot.totalBalance).toBe(15000000.5);
      expect(report.concentration).toHaveLength(2);
      expect(report.concentration[0].balancePercentage).toBe(65.4);
    });
  });

  describe("getLatestReport", () => {
    it("returns null if no snapshot exists", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const report = await trustlineAnalyticsService.getLatestReport(
        "FOBXX",
        "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5"
      );

      expect(report).toBeNull();
    });

    it("returns latest snapshot and all associated concentration metrics", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "snap-latest",
            assetCode: "FOBXX",
            assetIssuer: "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
            totalTrustlines: 1200,
            activeTrustlines: 950,
            totalBalance: "18000000.0000000",
            snapshotAt: new Date(),
            createdAt: new Date(),
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "metric-1",
            snapshotId: "snap-latest",
            percentile: "top_10",
            balancePercentage: "60.00",
            createdAt: new Date(),
          },
        ],
      });

      const report = await trustlineAnalyticsService.getLatestReport(
        "FOBXX",
        "GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5"
      );

      expect(report).not.toBeNull();
      expect(report?.snapshot.totalTrustlines).toBe(1200);
      expect(report?.concentration[0].balancePercentage).toBe(60);
    });
  });
});
