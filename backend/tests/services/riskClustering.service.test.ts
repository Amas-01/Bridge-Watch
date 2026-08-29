import { describe, it, expect, vi, beforeEach } from "vitest";
import { riskClusteringService } from "../../src/services/riskClustering.service.js";

const mockQuery = vi.fn();

vi.mock("../../src/database/db.js", () => ({
  db: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

describe("riskClusteringService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createCluster", () => {
    it("inserts a cluster and returns it", async () => {
      const mockResult = {
        rows: [
          {
            id: "cluster-1",
            name: "malicious-cluster",
            riskLevel: "critical",
            description: "Accounts connected to bridge exploit",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      const cluster = await riskClusteringService.createCluster(
        "malicious-cluster",
        "critical",
        "Accounts connected to bridge exploit"
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO stellar_account_clusters"),
        ["malicious-cluster", "critical", "Accounts connected to bridge exploit"]
      );
      expect(cluster).toBeDefined();
      expect(cluster.id).toBe("cluster-1");
      expect(cluster.riskLevel).toBe("critical");
    });
  });

  describe("mapAccountToCluster", () => {
    it("rejects invalid Stellar address length/format", async () => {
      await expect(
        riskClusteringService.mapAccountToCluster("cluster-1", "invalid-address", "admin")
      ).rejects.toThrow("Invalid Stellar account address format");
    });

    it("verifies cluster existence and maps account", async () => {
      // Mock getClusterById check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: "cluster-1", name: "bad-actors", riskLevel: "high" }],
      });

      // Mock INSERT mapping
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "map-1",
            clusterId: "cluster-1",
            accountAddress: "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE",
            reason: "Suspected laundered funds",
            confidenceScore: "0.85",
            addedBy: "admin",
            createdAt: new Date(),
          },
        ],
      });

      const mapping = await riskClusteringService.mapAccountToCluster(
        "cluster-1",
        "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE",
        "admin",
        "Suspected laundered funds",
        0.85
      );

      expect(mapping).toBeDefined();
      expect(mapping.confidenceScore).toBe(0.85);
      expect(mapping.accountAddress).toBe("GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE");
    });
  });

  describe("recordRiskSignal", () => {
    it("inserts a signal and returns it", async () => {
      const mockResult = {
        rows: [
          {
            id: "sig-1",
            accountAddress: "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE",
            signalType: "rapid_transfers",
            severity: "high",
            description: "Recorded 50 transfers in 1 minute",
            detectedAt: new Date(),
          },
        ],
      };
      mockQuery.mockResolvedValueOnce(mockResult);

      const signal = await riskClusteringService.recordRiskSignal(
        "GBHZAE5IQTOPQZ66TFWZYIYCHQ6T3GMWHDKFEXAKYWJ2BHLZQ227KRYE",
        "rapid_transfers",
        "high",
        "Recorded 50 transfers in 1 minute"
      );

      expect(signal).toBeDefined();
      expect(signal.severity).toBe("high");
      expect(signal.signalType).toBe("rapid_transfers");
    });
  });
});
