import { describe, it, expect, vi, beforeEach } from "vitest";
import { exportQuotaService, QuotaExceededException } from "../../src/services/exportQuota.service.js";

// Mock database
vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => mockDb),
}));

const mockDb: any = {
  transaction: vi.fn((cb) => cb(mockTrx)),
  where: vi.fn().mockReturnThis(),
  first: vi.fn(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  orderBy: vi.fn().mockReturnThis(),
};

const mockTrx: any = {
  where: vi.fn().mockReturnThis(),
  first: vi.fn(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  returning: vi.fn(),
  forUpdate: vi.fn().mockReturnThis(),
  raw: vi.fn((sql) => sql),
};

describe("ExportQuotaService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkQuota", () => {
    it("should return allowed when quota has remaining capacity", async () => {
      mockDb.first.mockResolvedValue({
        max_exports: 10,
        current_count: 5,
      });

      const result = await exportQuotaService.checkQuota("user1", "daily");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5);
    });

    it("should return not allowed when quota is exceeded", async () => {
      mockDb.first.mockResolvedValue({
        max_exports: 10,
        current_count: 10,
      });

      const result = await exportQuotaService.checkQuota("user1", "daily");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe("incrementExport - Atomic Increment", () => {
    it("should increment quota atomically when capacity remains", async () => {
      const mockQuota = {
        id: "quota-1",
        max_exports: 10,
        current_count: 5,
      };

      mockTrx.first.mockResolvedValue(mockQuota);

      await exportQuotaService.incrementExport("user1", "csv", 100);

      expect(mockTrx.forUpdate).toHaveBeenCalled();
      expect(mockTrx.update).toHaveBeenCalled();
      expect(mockTrx.insert).toHaveBeenCalled(); // audit log
    });

    it("should throw QuotaExceededException when limit reached", async () => {
      const mockQuota = {
        id: "quota-1",
        max_exports: 10,
        current_count: 10,
      };

      mockTrx.first.mockResolvedValue(mockQuota);

      await expect(
        exportQuotaService.incrementExport("user1", "csv", 100)
      ).rejects.toThrow(QuotaExceededException);
    });

    it("should use forUpdate lock to prevent race conditions", async () => {
      const mockQuota = {
        id: "quota-1",
        max_exports: 10,
        current_count: 5,
      };

      mockTrx.first.mockResolvedValue(mockQuota);

      await exportQuotaService.incrementExport("user1", "csv", 100);

      // Verify forUpdate was called before checking limit
      expect(mockTrx.forUpdate).toHaveBeenCalled();
    });
  });

  describe("resetExpiredQuotas", () => {
    it("should reset quotas for expired periods", async () => {
      mockDb.where.mockReturnThis();
      mockDb.update.mockResolvedValueOnce(5); // daily reset
      mockDb.update.mockResolvedValueOnce(3); // monthly reset

      const totalReset = await exportQuotaService.resetExpiredQuotas();

      expect(totalReset).toBe(8);
    });
  });

  describe("setUserQuota", () => {
    it("should create new quota if not exists", async () => {
      mockDb.first.mockResolvedValue(null);
      mockDb.returning.mockResolvedValue([
        {
          id: "new-quota",
          user_id: "user1",
          quota_type: "daily",
          max_exports: 20,
          current_count: 0,
          period_start: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const result = await exportQuotaService.setUserQuota(
        "user1",
        { quotaType: "daily", maxExports: 20 },
        "admin1"
      );

      expect(result.maxExports).toBe(20);
    });

    it("should update existing quota", async () => {
      mockDb.first.mockResolvedValue({
        id: "existing-quota",
        max_exports: 10,
      });
      mockDb.returning.mockResolvedValue([
        {
          id: "existing-quota",
          user_id: "user1",
          quota_type: "daily",
          max_exports: 30,
          current_count: 5,
          period_start: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ]);

      const result = await exportQuotaService.setUserQuota(
        "user1",
        { quotaType: "daily", maxExports: 30 },
        "admin1"
      );

      expect(result.maxExports).toBe(30);
    });
  });
});
