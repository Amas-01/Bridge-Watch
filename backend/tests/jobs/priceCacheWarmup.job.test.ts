import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  mockGetAggregatedPrice: vi.fn(),
  mockIncCacheHits: vi.fn(),
  mockIncCacheEvictions: vi.fn(),
  mockRedisGet: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerError: vi.fn(),
  mockLoggerDebug: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: mocks.mockLoggerInfo,
    warn: mocks.mockLoggerWarn,
    error: mocks.mockLoggerError,
    debug: mocks.mockLoggerDebug,
  },
}));

vi.mock("../../src/config/index.js", () => ({
  SUPPORTED_ASSETS: [
    { code: "USDC", issuer: "GA5ZSEJYB37JDD5G5LZ4U3V5GF4W6V6Y67Y67Y67Y67Y67Y67Y67Y67" },
    { code: "BTC", issuer: "GBRD6H...BTC" },
    { code: "ETH", issuer: "GBRD6H...ETH" },
    { code: "AQUA", issuer: "GBRD6H...AQUA" },
    { code: "XLM", issuer: "" },
    { code: "native", issuer: "" },
  ],
}));

vi.mock("../../src/utils/cache.js", () => ({
  CacheTTL: { PRICES: 60 },
  CacheService: vi.fn(),
}));

vi.mock("../../src/services/price.service.js", () => ({
  PriceService: vi.fn(() => ({
    getAggregatedPrice: mocks.mockGetAggregatedPrice,
  })),
}));

vi.mock("../../src/services/metrics.service.js", () => ({
  getMetricsService: vi.fn(() => ({
    cacheHits: { inc: mocks.mockIncCacheHits },
    cacheEvictions: { inc: mocks.mockIncCacheEvictions },
  })),
}));

vi.mock("../../src/utils/redis.js", () => ({
  redis: { get: mocks.mockRedisGet },
}));

describe("PriceCacheWarmup", () => {
  let runPriceCacheWarmup: (typeof import("../../src/jobs/priceCacheWarmup.job.js"))["runPriceCacheWarmup"];
  let getPriceCacheWarmupService: (typeof import("../../src/jobs/priceCacheWarmup.job.js"))["getPriceCacheWarmupService"];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(Date, "now").mockReturnValue(1_000_000_000);
    vi.resetModules();

    vi.doMock("../../src/utils/logger.js", () => ({
      logger: {
        info: mocks.mockLoggerInfo,
        warn: mocks.mockLoggerWarn,
        error: mocks.mockLoggerError,
        debug: mocks.mockLoggerDebug,
      },
    }));
    vi.doMock("../../src/config/index.js", () => ({
      SUPPORTED_ASSETS: [
        { code: "USDC", issuer: "GA5ZSEJYB37JDD5G5LZ4U3V5GF4W6V6Y67Y67Y67Y67Y67Y67Y67Y67" },
        { code: "BTC", issuer: "GBRD6H...BTC" },
        { code: "ETH", issuer: "GBRD6H...ETH" },
        { code: "AQUA", issuer: "GBRD6H...AQUA" },
        { code: "XLM", issuer: "" },
        { code: "native", issuer: "" },
      ],
    }));
    vi.doMock("../../src/utils/cache.js", () => ({
      CacheTTL: { PRICES: 60 },
      CacheService: vi.fn(),
    }));
    vi.doMock("../../src/services/price.service.js", () => ({
      PriceService: vi.fn(() => ({ getAggregatedPrice: mocks.mockGetAggregatedPrice })),
    }));
    vi.doMock("../../src/services/metrics.service.js", () => ({
      getMetricsService: vi.fn(() => ({
        cacheHits: { inc: mocks.mockIncCacheHits },
        cacheEvictions: { inc: mocks.mockIncCacheEvictions },
      })),
    }));
    vi.doMock("../../src/utils/redis.js", () => ({
      redis: { get: mocks.mockRedisGet },
    }));

    const mod = await import("../../src/jobs/priceCacheWarmup.job.js");
    runPriceCacheWarmup = mod.runPriceCacheWarmup;
    getPriceCacheWarmupService = mod.getPriceCacheWarmupService;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("runPriceCacheWarmup", () => {
    it("should warm up prices for non-native, non-XLM assets", async () => {
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      const metrics = await runPriceCacheWarmup({ enabled: true });

      expect(metrics.totalAssets).toBe(4);
      expect(metrics.successfulWarmups).toBe(4);
      expect(metrics.failedWarmups).toBe(0);
      expect(mocks.mockGetAggregatedPrice).toHaveBeenCalledTimes(4);
      expect(mocks.mockGetAggregatedPrice).toHaveBeenCalledWith("USDC", true);
      expect(mocks.mockGetAggregatedPrice).toHaveBeenCalledWith("BTC", true);
      expect(mocks.mockGetAggregatedPrice).toHaveBeenCalledWith("ETH", true);
      expect(mocks.mockGetAggregatedPrice).toHaveBeenCalledWith("AQUA", true);
    });

    it("should emit cache hit metrics after warmup", async () => {
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      await runPriceCacheWarmup({ enabled: true });

      expect(mocks.mockIncCacheHits).toHaveBeenCalled();
    });

    it("should count failures when getAggregatedPrice rejects", async () => {
      mocks.mockGetAggregatedPrice.mockRejectedValue(new Error("network error"));

      const metrics = await runPriceCacheWarmup({
        enabled: true,
        maxRetries: 1,
        retryDelayMs: 0,
      });

      expect(metrics.failedWarmups).toBe(4);
      expect(metrics.successfulWarmups).toBe(0);
    });

    it("should retry on failure and succeed on subsequent attempt", async () => {
      vi.useRealTimers();
      mocks.mockGetAggregatedPrice
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValue({ vwap: 42.5 });

      const metrics = await runPriceCacheWarmup({
        enabled: true,
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(metrics.successfulWarmups).toBe(4);
      expect(metrics.failedWarmups).toBe(0);
      vi.useFakeTimers();
      vi.spyOn(Date, "now").mockReturnValue(1_000_000_000);
    });

    it("should skip invalid prices (vwap <= 0)", async () => {
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 0 });

      const metrics = await runPriceCacheWarmup({
        enabled: true,
        maxRetries: 1,
        retryDelayMs: 0,
      });

      expect(metrics.failedWarmups).toBe(4);
      expect(metrics.successfulWarmups).toBe(0);
    });

    it("should track last warmup time after completion", async () => {
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      await runPriceCacheWarmup({ enabled: true });

      const service = getPriceCacheWarmupService();
      expect(service.getLastWarmupTime()).toBeDefined();
    });

    it("should set warmupInProgress to false after completion", async () => {
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      await runPriceCacheWarmup({ enabled: true });

      const service = getPriceCacheWarmupService();
      expect(service.isWarmupInProgress()).toBe(false);
    });

    it("should handle concurrent warmup calls by skipping the second", async () => {
      vi.useRealTimers();
      let resolveFirst!: (v: unknown) => void;
      const firstPromise = new Promise((resolve) => {
        resolveFirst = resolve;
      });

      mocks.mockGetAggregatedPrice.mockImplementation(() => firstPromise);

      const p1 = runPriceCacheWarmup({ enabled: true, maxRetries: 1, retryDelayMs: 10 });

      await new Promise((r) => setTimeout(r, 5));

      const p2 = runPriceCacheWarmup({ enabled: true, maxRetries: 1, retryDelayMs: 10 });

      resolveFirst({ vwap: 1.0 });
      const [m1, m2] = await Promise.all([p1, p2]);

      expect(m1.totalAssets).toBe(4);
      expect(m2.totalAssets).toBe(0);
      vi.useFakeTimers();
      vi.spyOn(Date, "now").mockReturnValue(1_000_000_000);
    });

    it("should return duration >= 0 and a Date timestamp", async () => {
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      const metrics = await runPriceCacheWarmup({ enabled: true });

      expect(metrics.duration).toBeGreaterThanOrEqual(0);
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    it("should handle cache check errors gracefully", async () => {
      mocks.mockRedisGet.mockRejectedValue(new Error("redis down"));
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      const metrics = await runPriceCacheWarmup({ enabled: true });

      expect(metrics.successfulWarmups).toBe(4);
      expect(mocks.mockGetAggregatedPrice).toHaveBeenCalledTimes(4);
    });

    it("should handle null redis cache responses", async () => {
      mocks.mockRedisGet.mockResolvedValue(null);
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      const metrics = await runPriceCacheWarmup({ enabled: true });

      expect(metrics.successfulWarmups).toBe(4);
    });

    it("should handle malformed cache JSON gracefully", async () => {
      mocks.mockRedisGet.mockResolvedValue("not-valid-json{{{");
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      const metrics = await runPriceCacheWarmup({ enabled: true });

      expect(metrics.successfulWarmups).toBe(4);
    });

    it("should log warmup completion", async () => {
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      await runPriceCacheWarmup({ enabled: true });

      expect(mocks.mockLoggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          totalAssets: 4,
          successful: 4,
          failed: 0,
        }),
        "Price cache warmup completed"
      );
    });

    it("should log a warning when warmup is already in progress", async () => {
      vi.useRealTimers();
      const resolvers: Array<(v: unknown) => void> = [];
      mocks.mockGetAggregatedPrice.mockImplementation(() => new Promise((r) => { resolvers.push(r); }));

      const p1 = runPriceCacheWarmup({ enabled: true, maxRetries: 1, retryDelayMs: 10 });

      await new Promise((r) => setTimeout(r, 5));

      const p2 = runPriceCacheWarmup({ enabled: true, maxRetries: 1, retryDelayMs: 10 });

      resolvers.forEach((r) => r({ vwap: 1.0 }));
      await Promise.all([p1, p2]);

      expect(mocks.mockLoggerWarn).toHaveBeenCalledWith(
        "Price cache warmup already in progress, skipping"
      );
      vi.useFakeTimers();
      vi.spyOn(Date, "now").mockReturnValue(1_000_000_000);
    }, 10000);

    it("should log an error when all retries fail for an asset", async () => {
      vi.useRealTimers();
      mocks.mockGetAggregatedPrice.mockRejectedValue(new Error("permanent failure"));

      await runPriceCacheWarmup({
        enabled: true,
        maxRetries: 1,
        retryDelayMs: 10,
      });

      expect(mocks.mockLoggerError).toHaveBeenCalledWith(
        expect.objectContaining({ asset: expect.any(String) }),
        "Price warmup failed after all retries"
      );
      vi.useFakeTimers();
      vi.spyOn(Date, "now").mockReturnValue(1_000_000_000);
    });

    it("should emit cache eviction metrics after warmup", async () => {
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      await runPriceCacheWarmup({ enabled: true });

      expect(mocks.mockIncCacheEvictions).toHaveBeenCalled();
    });

    it("should log starting info message", async () => {
      mocks.mockGetAggregatedPrice.mockResolvedValue({ vwap: 1.0 });

      await runPriceCacheWarmup({ enabled: true });

      expect(mocks.mockLoggerInfo).toHaveBeenCalledWith(
        "Starting price cache warmup"
      );
    });

    it("should log a warning per failed retry attempt", async () => {
      vi.useRealTimers();
      mocks.mockGetAggregatedPrice.mockRejectedValue(new Error("fail"));

      await runPriceCacheWarmup({
        enabled: true,
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(mocks.mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          asset: expect.any(String),
          attempt: expect.any(Number),
        }),
        "Price warmup attempt failed"
      );
      vi.useFakeTimers();
      vi.spyOn(Date, "now").mockReturnValue(1_000_000_000);
    });
  });
});
