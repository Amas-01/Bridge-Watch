import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { AnalyticsService } from "../../src/services/analytics.service.js";
import { PriceService } from "../../src/services/price.service.js";
import { PriceModel } from "../../src/database/models/price.model.js";
import { AggregationService } from "../../src/services/aggregation.service.js";
import { LiquidityFragmentationService } from "../../src/services/liquidityFragmentation.service.js";

const { mockRaw, mockKnex } = vi.hoisted(() => {
  const mockRawFn = vi.fn();
  const mockKnexFn = vi.fn((table: string) => {
    const builder: any = {
      select: () => builder,
      where: () => builder,
      whereIn: () => builder,
      orderBy: () => builder,
      groupBy: () => builder,
      limit: () => builder,
      then: (resolve: (val: any) => any) => resolve([]),
    };
    return builder;
  });
  Object.assign(mockKnexFn, { raw: mockRawFn });
  return { mockRaw: mockRawFn, mockKnex: mockKnexFn };
});

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockKnex,
}));

vi.mock("../../src/utils/cache.js", () => ({
  CacheService: {
    getOrSet: vi.fn(async (_key, fetcher) => fetcher()),
    generateKey: vi.fn((ns, id) => `${ns}:${id}`),
    invalidateByTag: vi.fn(),
    invalidatePattern: vi.fn(),
  },
  CacheTTL: { ANALYTICS: 300 },
}));

vi.mock("../../src/utils/redis.js", () => ({
  redis: {
    get: vi.fn(async () => null),
    setex: vi.fn(async () => "OK"),
  },
}));

describe("Continuous Aggregates Query Optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("PriceModel.getTimeBucketed", () => {
    it("should query prices_daily continuous aggregate for 30d range", async () => {
      const model = new PriceModel();
      const startTime = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      mockRaw.mockResolvedValueOnce({
        rows: [{ bucket: new Date(), avg_price: 1.25, source: "AGGREGATED" }],
      });

      const result = await model.getTimeBucketed("USDC", "1 day", startTime);

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining("FROM prices_daily"),
        ["USDC", startTime]
      );
      expect(result).toHaveLength(1);
    });

    it("should query prices_hourly continuous aggregate for 7d range", async () => {
      const model = new PriceModel();
      const startTime = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      mockRaw.mockResolvedValueOnce({
        rows: [{ bucket: new Date(), avg_price: 1.20, source: "AGGREGATED" }],
      });

      const result = await model.getTimeBucketed("USDC", "6 hours", startTime);

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining("FROM prices_hourly"),
        ["6 hours", "USDC", startTime]
      );
      expect(result).toHaveLength(1);
    });

    it("should query raw prices hypertable for short range (< 7d)", async () => {
      const model = new PriceModel();
      const startTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
      mockRaw.mockResolvedValueOnce({
        rows: [{ bucket: new Date(), avg_price: 1.0, source: "SDEX" }],
      });

      await model.getTimeBucketed("USDC", "1 hour", startTime);

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining("FROM prices"),
        ["1 hour", "USDC", startTime]
      );
    });
  });

  describe("AnalyticsService.getHistoricalComparison", () => {
    it("should query prices_daily continuous aggregate for 30d price history", async () => {
      const service = new AnalyticsService();
      mockRaw.mockResolvedValueOnce({
        rows: [{ date: "2026-07-01", value: "1.05" }],
      });

      await service.getHistoricalComparison("price", "USDC", 30);

      expect(mockKnex).toHaveBeenCalledWith("prices_daily");
    });

    it("should query health_scores_hourly for 14d health score history", async () => {
      const service = new AnalyticsService();
      mockRaw.mockResolvedValueOnce({
        rows: [{ date: "2026-07-15", value: "95" }],
      });

      await service.getHistoricalComparison("health_score", "USDC", 14);

      expect(mockKnex).toHaveBeenCalledWith("health_scores_hourly");
    });
  });

  describe("AggregationService", () => {
    it("should target prices_daily when aggregating 30d price range", async () => {
      const service = new AggregationService();
      const startTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const endTime = new Date();

      mockRaw.mockResolvedValueOnce({
        rows: [
          {
            symbol: "USDC",
            interval: "1d",
            period_start: new Date(),
            period_end: new Date(),
            open: 1.0,
            high: 1.02,
            low: 0.99,
            close: 1.01,
            avg: 1.005,
            volume: 50000,
            count: 100,
          },
        ],
      });

      const result = await service.aggregatePrices("USDC", "1d", startTime, endTime);

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining("FROM prices_daily"),
        ["USDC", startTime, endTime]
      );
      expect(result).toHaveLength(1);
    });

    it("should target health_scores_hourly when aggregating 7d health score range", async () => {
      const service = new AggregationService();
      const startTime = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const endTime = new Date();

      mockRaw.mockResolvedValueOnce({
        rows: [
          {
            symbol: "XLM",
            interval: "1h",
            period_start: new Date(),
            period_end: new Date(),
            avg_overall_score: 92,
            avg_liquidity_score: 90,
            avg_price_stability_score: 95,
            avg_bridge_uptime_score: 99,
            avg_reserve_backing_score: 100,
            avg_volume_trend_score: 80,
            min_overall_score: 85,
            max_overall_score: 98,
            count: 24,
          },
        ],
      });

      const result = await service.aggregateHealthScores("XLM", "1h", startTime, endTime);

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining("FROM health_scores_hourly"),
        ["XLM", startTime, endTime]
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("LiquidityFragmentationService", () => {
    it("should target liquidity_hourly for 7d fragmentation trend", async () => {
      const service = new LiquidityFragmentationService();
      mockRaw.mockResolvedValueOnce({
        rows: [
          {
            timestamp: new Date(),
            total_liquidity: 1000000,
            dex_count: 3,
            liquidities: [600000, 300000, 100000],
          },
          {
            timestamp: new Date(),
            total_liquidity: 1100000,
            dex_count: 3,
            liquidities: [650000, 320000, 130000],
          },
        ],
      });

      const trend = await service.getFragmentationTrend("USDC", "7d");

      expect(mockRaw).toHaveBeenCalledWith(
        expect.stringContaining("FROM liquidity_hourly"),
        ["USDC"]
      );
      expect(trend).not.toBeNull();
      expect(trend?.symbol).toBe("USDC");
    });
  });
});
