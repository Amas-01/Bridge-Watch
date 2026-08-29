import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

const analyticsServiceMocks = vi.hoisted(() => ({
  getProtocolStats: vi.fn(),
  getBridgeComparisons: vi.fn(),
  getAssetRankings: vi.fn(),
  getVolumeAggregation: vi.fn(),
  calculateTrend: vi.fn(),
  getTopPerformers: vi.fn(),
  getHistoricalComparison: vi.fn(),
  invalidateCache: vi.fn(),
  executeCustomMetric: vi.fn(),
}));

vi.mock("../../src/services/analytics.service.js", () => ({
  AnalyticsService: class {
    getProtocolStats = analyticsServiceMocks.getProtocolStats;
    getBridgeComparisons = analyticsServiceMocks.getBridgeComparisons;
    getAssetRankings = analyticsServiceMocks.getAssetRankings;
    getVolumeAggregation = analyticsServiceMocks.getVolumeAggregation;
    calculateTrend = analyticsServiceMocks.calculateTrend;
    getTopPerformers = analyticsServiceMocks.getTopPerformers;
    getHistoricalComparison = analyticsServiceMocks.getHistoricalComparison;
    invalidateCache = analyticsServiceMocks.invalidateCache;
    executeCustomMetric = analyticsServiceMocks.executeCustomMetric;
  },
  AggregationPeriod: {
    Hourly: "hourly",
    Daily: "daily",
    Weekly: "weekly",
    Monthly: "monthly",
  },
}));

describe("Analytics API", () => {
  let server: FastifyInstance;

  beforeEach(() => {
    Object.values(analyticsServiceMocks).forEach((mock) => mock.mockReset());
    analyticsServiceMocks.getProtocolStats.mockResolvedValue({});
    analyticsServiceMocks.getBridgeComparisons.mockResolvedValue([]);
    analyticsServiceMocks.getAssetRankings.mockResolvedValue([]);
    analyticsServiceMocks.getVolumeAggregation.mockResolvedValue([]);
    analyticsServiceMocks.calculateTrend.mockResolvedValue({});
    analyticsServiceMocks.getTopPerformers.mockResolvedValue([]);
    analyticsServiceMocks.getHistoricalComparison.mockResolvedValue([]);
    analyticsServiceMocks.executeCustomMetric.mockResolvedValue({});
  });

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("GET /api/v1/analytics/protocol", () => {
    it("should return protocol-wide statistics", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/protocol",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(body).toHaveProperty("data");
    });
  });

  describe("GET /api/v1/analytics/volume", () => {
    it("should return daily volume aggregation by default", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/volume",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });

    it("should accept valid period values", async () => {
      for (const period of ["hourly", "daily", "weekly", "monthly"]) {
        const response = await server.inject({
          method: "GET",
          url: `/api/v1/analytics/volume?period=${period}`,
        });
        expect(response.statusCode).toBe(200);
      }
    });

    it("should return 400 for invalid period", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/volume?period=invalid",
      });

      expect(response.statusCode).toBe(400);
    });

    it("should filter by symbol when provided", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/volume?period=daily&symbol=USDC",
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /api/v1/analytics/bridges/comparison", () => {
    it("should return bridge comparison metrics", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/bridges/comparison",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });
  });

  describe("GET /api/v1/analytics/assets/rankings", () => {
    it("should return asset rankings", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/assets/rankings",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });
  });

  describe("GET /api/v1/analytics/top-performers", () => {
    it("should return top assets by default", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/top-performers",
      });

      expect(response.statusCode).toBe(200);
    });

    it("should return 400 for invalid type", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/top-performers?type=invalid",
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for invalid metric", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/top-performers?metric=invalid",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET /api/v1/analytics/trends/:metric", () => {
    it("should return trend data for a metric", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/trends/volume",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });
  });

  describe("GET /api/v1/analytics/summary", () => {
    it("should return combined analytics summary", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/summary",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
    });
  });

  describe("GET /api/v1/analytics/custom-metrics", () => {
    it("should list all custom metrics", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/custom-metrics",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("success", true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe("GET /api/v1/analytics/custom-metrics/:metricId", () => {
    it("should return 404 for unknown metric id", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/analytics/custom-metrics/non-existent-metric",
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
