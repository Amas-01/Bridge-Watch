import { describe, it, expect, vi, beforeEach } from "vitest";
import { AssetFreshnessService, type PerSourceFreshness } from "../../src/services/assetFreshness.service.js";

const mocks = vi.hoisted(() => ({
  db: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  max: vi.fn(),
  first: vi.fn(),
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn().mockReturnValue((table: string) => {
    mocks.db(table);
    return {
      select: mocks.select,
    };
  }),
}));

vi.mock("../../src/config/stalenessRules.js", () => ({
  STALENESS_RULES: [
    {
      key: "prices",
      label: "Price Data",
      table: "prices",
      timeColumn: "updated_at",
      sourceType: "source",
      expectedIntervalMs: 60000,
      warnAfterMs: 300000,
      criticalAfterMs: 600000,
    },
    {
      key: "health_scores",
      label: "Health Scores",
      table: "health_scores",
      timeColumn: "created_at",
      sourceType: "source",
      expectedIntervalMs: 120000,
      warnAfterMs: 600000,
      criticalAfterMs: 1200000,
    },
  ],
}));

vi.mock("../../src/utils/cache.js", () => ({
  CacheService: {
    generateKey: vi.fn((a, b) => `${a}:${b}`),
    getOrSet: vi.fn(async (key, fn) => fn()),
  },
  CacheTTL: { ANALYTICS: 300 },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe("AssetFreshnessService", () => {
  let service: AssetFreshnessService;
  const now = Date.now();

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AssetFreshnessService();
  });

  describe("Fresh data scoring", () => {
    it("should mark data as fresh when age is below warning threshold", async () => {
      const freshTime = new Date(now - 100000).toISOString();

      mocks.select.mockReturnValue({
        where: mocks.where,
      });
      mocks.where.mockReturnValue({
        max: mocks.max,
      });
      mocks.max.mockReturnValue({
        first: mocks.first,
      });
      mocks.first
        .mockResolvedValueOnce({ id: "asset1", symbol: "USDC", name: "USD Coin" })
        .mockResolvedValueOnce({ latest: freshTime })
        .mockResolvedValueOnce({ latest: freshTime });

      const detail = await service.getAssetDetail("USDC");

      expect(detail).not.toBeNull();
      expect(detail?.overallStatus).toBe("FRESH");
      expect(detail?.sources[0]?.status).toBe("fresh");
    });

    it("should mark data as warning when age exceeds warning threshold", async () => {
      const staleTime = new Date(now - 400000).toISOString();

      mocks.select.mockReturnValue({
        where: mocks.where,
      });
      mocks.where.mockReturnValue({
        max: mocks.max,
      });
      mocks.max.mockReturnValue({
        first: mocks.first,
      });
      mocks.first
        .mockResolvedValueOnce({ id: "asset1", symbol: "USDC", name: "USD Coin" })
        .mockResolvedValueOnce({ latest: staleTime })
        .mockResolvedValueOnce({ latest: staleTime });

      const detail = await service.getAssetDetail("USDC");

      expect(detail?.sources.some((s) => s.status === "warning")).toBe(true);
    });
  });

  describe("Stale asset detection", () => {
    it("should mark asset as stale when critical threshold exceeded", async () => {
      const criticalTime = new Date(now - 700000).toISOString();

      mocks.select.mockReturnValue({
        where: mocks.where,
      });
      mocks.where.mockReturnValue({
        max: mocks.max,
      });
      mocks.max.mockReturnValue({
        first: mocks.first,
      });
      mocks.first
        .mockResolvedValueOnce({ id: "asset1", symbol: "USDC", name: "USD Coin" })
        .mockResolvedValueOnce({ latest: criticalTime })
        .mockResolvedValueOnce({ latest: criticalTime });

      const detail = await service.getAssetDetail("USDC");

      expect(detail?.overallStatus).toBe("STALE");
      expect(detail?.sources.some((s) => s.status === "stale")).toBe(true);
    });

    it("should mark asset as degraded when data is missing", async () => {
      mocks.select.mockReturnValue({
        where: mocks.where,
      });
      mocks.where.mockReturnValue({
        max: mocks.max,
      });
      mocks.max.mockReturnValue({
        first: mocks.first,
      });
      mocks.first
        .mockResolvedValueOnce({ id: "asset1", symbol: "USDC", name: "USD Coin" })
        .mockResolvedValueOnce({ latest: null })
        .mockResolvedValueOnce({ latest: null });

      const detail = await service.getAssetDetail("USDC");

      expect(detail?.overallStatus).toBe("DEGRADED");
      expect(detail?.sources.every((s) => s.status === "missing")).toBe(true);
    });
  });

  describe("Threshold boundary conditions", () => {
    it("should transition from fresh to warning at exact threshold", async () => {
      const boundaryTime = new Date(now - 300000).toISOString();

      mocks.select.mockReturnValue({
        where: mocks.where,
      });
      mocks.where.mockReturnValue({
        max: mocks.max,
      });
      mocks.max.mockReturnValue({
        first: mocks.first,
      });
      mocks.first
        .mockResolvedValueOnce({ id: "asset1", symbol: "USDC", name: "USD Coin" })
        .mockResolvedValueOnce({ latest: boundaryTime })
        .mockResolvedValueOnce({ latest: boundaryTime });

      const detail = await service.getAssetDetail("USDC");

      expect(detail?.sources[0]?.status).toBe("fresh");
    });

    it("should handle null ages in worst sources sorting", async () => {
      const freshTime = new Date(now - 100000).toISOString();

      mocks.select.mockReturnValue({
        where: mocks.where,
      });
      mocks.where.mockReturnValue({
        max: mocks.max,
      });
      mocks.max.mockReturnValue({
        first: mocks.first,
      });
      mocks.first
        .mockResolvedValueOnce({ id: "asset1", symbol: "USDC", name: "USD Coin" })
        .mockResolvedValueOnce({ latest: freshTime })
        .mockResolvedValueOnce({ latest: null });

      const detail = await service.getAssetDetail("USDC");

      expect(detail?.worstSources).toBeDefined();
      expect(detail?.worstSources.length).toBeGreaterThan(0);
      expect(detail?.worstSources[0]?.ageMs).not.toBeNull();
    });
  });

  describe("Error handling", () => {
    it("should handle database errors gracefully", async () => {
      mocks.select.mockReturnValue({
        where: mocks.where,
      });
      mocks.where.mockReturnValue({
        max: mocks.max,
      });
      mocks.max.mockReturnValue({
        first: mocks.first,
      });
      mocks.first
        .mockResolvedValueOnce({ id: "asset1", symbol: "USDC", name: "USD Coin" })
        .mockRejectedValueOnce(new Error("DB connection failed"));

      const detail = await service.getAssetDetail("USDC");

      expect(detail?.sources[0]?.status).toBe("missing");
      expect(detail?.sources[0]?.ageMs).toBeNull();
    });

    it("should return null for non-existent asset", async () => {
      mocks.select.mockReturnValue({
        where: mocks.where,
      });
      mocks.where.mockReturnValue({
        max: mocks.max,
      });
      mocks.max.mockReturnValue({
        first: mocks.first,
      });
      mocks.first.mockResolvedValueOnce(null);

      const detail = await service.getAssetDetail("NONEXISTENT");

      expect(detail).toBeNull();
    });
  });
});
