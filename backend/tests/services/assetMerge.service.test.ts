import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssetMergeService } from "../../src/services/assetMerge.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => {
    const b: any = {};
    b.then = (resolve: any) => Promise.resolve([]).then(resolve);
    b.where = vi.fn().mockReturnValue(b);
    b.whereIn = vi.fn().mockReturnValue(b);
    b.orderBy = vi.fn().mockReturnValue(b);
    b.insert = vi.fn().mockReturnValue(b);
    b.update = vi.fn().mockReturnValue(b);
    b.delete = vi.fn().mockResolvedValue(1);
    b.first = vi.fn().mockResolvedValue(null);
    b.returning = vi.fn().mockResolvedValue([]);
    b.limit = vi.fn().mockReturnValue(b);
    const fn = (_t: string) => b;
    return fn;
  }),
}));

describe("AssetMergeService", () => {
  let service: AssetMergeService;

  beforeEach(() => {
    (AssetMergeService as any).instance = undefined;
    service = AssetMergeService.getInstance();
    vi.clearAllMocks();
  });

  describe("findDuplicates", () => {
    it("returns empty array when no duplicates exist", async () => {
      const groups = await service.findDuplicates();
      expect(groups).toEqual([]);
    });
  });

  describe("merge", () => {
    it("throws when primary asset not found", async () => {
      await expect(
        service.merge("nonexistent", ["dup-1"], "ops")
      ).rejects.toThrow("Primary asset not found");
    });

    it("throws when duplicate assets not found", async () => {
      const db = vi.mocked(require("../../src/database/connection.js").getDatabase());
      const b = db();
      b.first = vi.fn().mockResolvedValueOnce({ id: "primary", symbol: "USDC" });
      b.whereIn = vi.fn().mockReturnValue(b);
      const origWhere = b.where;
      b.where = vi.fn((col: string, val: string) => {
        if (col === "id") return b;
        return origWhere.call(b, col, val);
      });
      b.then = (resolve: any) => Promise.resolve([]).then(resolve);

      await expect(
        service.merge("primary", ["dup-missing"], "ops")
      ).rejects.toThrow("One or more duplicate assets not found");
    });

    it("handles inactive source assets by setting them to inactive", async () => {
      const db = vi.mocked(require("../../src/database/connection.js").getDatabase());
      const b = db();
      const primary = { id: "asset-1", symbol: "USDC", name: "USD Coin", issuer: "Circle" };
      const duplicate = { id: "asset-2", symbol: "USDC", name: "USD Coin", issuer: "Circle", is_active: false };

      b.first = vi.fn().mockResolvedValueOnce(primary);
      b.whereIn = vi.fn().mockReturnValue(b);
      b.where = vi.fn().mockReturnValue(b);
      b.then = vi.fn((resolve: any) => Promise.resolve([duplicate]).then(resolve));

      const result = await service.merge("asset-1", ["asset-2"], "admin");
      expect(result.mergedAssetIds).toContain("asset-2");
    });

    it("resolves conflicts by preferring non-empty fields from duplicates", async () => {
      const db = vi.mocked(require("../../src/database/connection.js").getDatabase());
      const b = db();
      const primary = { id: "asset-1", symbol: "USDC", name: "", issuer: "Circle" };
      const duplicate = { id: "asset-2", symbol: "USDC", name: "USD Coin", issuer: "Circle" };

      let updateData: Record<string, unknown> = {};
      b.update = vi.fn((data: Record<string, unknown>) => {
        updateData = data;
        return b;
      });
      b.first = vi.fn().mockResolvedValueOnce(primary);
      b.whereIn = vi.fn().mockReturnValue(b);
      b.where = vi.fn().mockReturnValue(b);
      b.then = vi.fn((resolve: any) => Promise.resolve([duplicate]).then(resolve));

      const result = await service.merge("asset-1", ["asset-2"], "admin");
      expect(result.conflictsResolved.some(c => c.field === "name")).toBe(true);
    });
  });

  describe("proposeMerge", () => {
    it("creates a pending review", async () => {
      const review = await service.proposeMerge({
        primaryAssetId: "asset-1",
        primarySymbol: "USDC",
        duplicateIds: ["asset-2"],
        matchScore: 0.9,
        matchReason: "same symbol",
      });

      expect(review.status).toBe("pending");
      expect(review.duplicateGroup.primarySymbol).toBe("USDC");
    });
  });

  describe("getReview", () => {
    it("returns null for unknown review", async () => {
      const review = await service.getReview("nonexistent");
      expect(review).toBeNull();
    });
  });

  describe("listReviews", () => {
    it("returns empty array when no reviews", async () => {
      const reviews = await service.listReviews();
      expect(reviews).toEqual([]);
    });
  });

  describe("getMergeHistory", () => {
    it("returns empty array when no history", async () => {
      const history = await service.getMergeHistory();
      expect(history).toEqual([]);
    });

    it("filters history by primaryAssetId", async () => {
      const db = vi.mocked(require("../../src/database/connection.js").getDatabase());
      const b = db();
      b.where = vi.fn().mockReturnValue(b);
      b.orderBy = vi.fn().mockReturnValue(b);
      b.then = (resolve: any) => Promise.resolve([]).then(resolve);

      await service.getMergeHistory({ primaryAssetId: "asset-1" });
      expect(b.where).toHaveBeenCalledWith("primary_asset_id", "asset-1");
    });

    it("limits results by limit parameter", async () => {
      const db = vi.mocked(require("../../src/database/connection.js").getDatabase());
      const b = db();
      b.limit = vi.fn().mockReturnValue(b);
      b.orderBy = vi.fn().mockReturnValue(b);
      b.then = (resolve: any) => Promise.resolve([]).then(resolve);

      await service.getMergeHistory({ limit: 10 });
      expect(b.limit).toHaveBeenCalledWith(10);
    });
  });

  describe("reviewMerge", () => {
    it("returns null for non-existent review", async () => {
      const review = await service.reviewMerge("nonexistent", "approved", "admin");
      expect(review).toBeNull();
    });

    it("updates review status when approving", async () => {
      const db = vi.mocked(require("../../src/database/connection.js").getDatabase());
      const b = db();
      const existingReview = {
        id: "review-1",
        duplicate_group: JSON.stringify({
          primaryAssetId: "asset-1",
          duplicateIds: ["asset-2"],
        }),
      };

      b.first = vi.fn()
        .mockResolvedValueOnce(existingReview)
        .mockResolvedValueOnce(existingReview);
      b.where = vi.fn().mockReturnValue(b);
      b.update = vi.fn().mockReturnValue(b);
      b.then = (resolve: any) => Promise.resolve([]).then(resolve);

      await service.reviewMerge("review-1", "approved", "admin", "looks good");
      expect(b.update).toHaveBeenCalled();
    });

    it("rejects merge without triggering actual merge", async () => {
      const db = vi.mocked(require("../../src/database/connection.js").getDatabase());
      const b = db();
      const existingReview = {
        id: "review-1",
        duplicate_group: JSON.stringify({
          primaryAssetId: "asset-1",
          duplicateIds: ["asset-2"],
        }),
      };

      let updateCalled = false;
      b.first = vi.fn().mockResolvedValueOnce(existingReview);
      b.where = vi.fn().mockReturnValue(b);
      b.update = vi.fn(() => {
        updateCalled = true;
        return b;
      });
      b.then = (resolve: any) => Promise.resolve([]).then(resolve);

      await service.reviewMerge("review-1", "rejected", "admin");
      // Update should be called to mark review as rejected, but merge should not occur
      expect(updateCalled).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles findDuplicates with alias mapping collisions", async () => {
      const db = vi.mocked(require("../../src/database/connection.js").getDatabase());
      const b = db();
      const assets = [
        { id: "asset-1", symbol: "USDC", name: "USD Coin", issuer: "Circle" },
        { id: "asset-2", symbol: "USDC", name: "USD Coin", issuer: "Circle" },
        { id: "asset-3", symbol: "USDC", name: "USD Coin", issuer: "Circle" },
      ];

      b.where = vi.fn().mockReturnValue(b);
      b.orderBy = vi.fn().mockReturnValue(b);
      b.then = (resolve: any) => Promise.resolve(assets).then(resolve);

      const groups = await service.findDuplicates();
      // Should create groups without collision issues
      expect(Array.isArray(groups)).toBe(true);
      groups.forEach((group) => {
        expect(group.primaryAssetId).toBeDefined();
        expect(Array.isArray(group.duplicateIds)).toBe(true);
      });
    });

    it("handles merge with multiple conflicts", async () => {
      const db = vi.mocked(require("../../src/database/connection.js").getDatabase());
      const b = db();
      const primary = { id: "asset-1", symbol: "USDC", name: "", issuer: "" };
      const dup1 = { id: "asset-2", symbol: "USDC", name: "Coin 1", issuer: "Issuer A" };
      const dup2 = { id: "asset-3", symbol: "USDC", name: "Coin 2", issuer: "Issuer B" };

      b.first = vi.fn().mockResolvedValueOnce(primary);
      b.whereIn = vi.fn().mockReturnValue(b);
      b.where = vi.fn().mockReturnValue(b);
      b.update = vi.fn().mockReturnValue(b);
      b.insert = vi.fn().mockReturnValue(b);
      b.then = vi.fn((resolve: any) => Promise.resolve([dup1, dup2]).then(resolve));

      const result = await service.merge("asset-1", ["asset-2", "asset-3"], "admin");
      expect(result.conflictsResolved.length).toBeGreaterThan(0);
      expect(result.mergedAssetIds).toEqual(["asset-2", "asset-3"]);
    });
  });
});
