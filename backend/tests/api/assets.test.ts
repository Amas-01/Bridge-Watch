import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

const healthServiceMock = vi.hoisted(() => ({
  getHealthScore: vi.fn(),
}));
const liquidityServiceMock = vi.hoisted(() => ({
  getAggregatedLiquidity: vi.fn(),
}));
const priceServiceMock = vi.hoisted(() => ({
  getAggregatedPrice: vi.fn(),
}));

vi.mock("../../src/services/health.service.js", () => ({
  HealthService: class {
    getHealthScore = healthServiceMock.getHealthScore;
  },
}));
vi.mock("../../src/services/liquidity.service.js", () => ({
  LiquidityService: class {
    getAggregatedLiquidity = liquidityServiceMock.getAggregatedLiquidity;
  },
}));
vi.mock("../../src/services/price.service.js", () => ({
  PriceService: class {
    getAggregatedPrice = priceServiceMock.getAggregatedPrice;
  },
}));

describe("Assets API", () => {
  let server: FastifyInstance;

  beforeEach(() => {
    Object.values(healthServiceMock).forEach((mock) => mock.mockReset());
    Object.values(liquidityServiceMock).forEach((mock) => mock.mockReset());
    Object.values(priceServiceMock).forEach((mock) => mock.mockReset());

    healthServiceMock.getHealthScore.mockResolvedValue({ score: 95 });
    liquidityServiceMock.getAggregatedLiquidity.mockResolvedValue({ total: 1000000 });
    priceServiceMock.getAggregatedPrice.mockResolvedValue({ price: 1.00 });
  });

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("GET /api/v1/assets", () => {
    it("should return a list of monitored assets", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("assets");
      expect(Array.isArray(body.assets)).toBe(true);
    });
  });

  describe("GET /api/v1/assets/:symbol", () => {
    it("should return asset details for a given symbol", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets/USDC",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("symbol", "USDC");
    });
  });

  describe("GET /api/v1/assets/:symbol/health", () => {
    it("should return health score for an asset", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets/USDC/health",
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /api/v1/assets/:symbol/liquidity", () => {
    it("should return liquidity data for an asset", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets/USDC/liquidity",
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /api/v1/assets/:symbol/price", () => {
    it("should return aggregated price data for an asset", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets/USDC/price",
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe("GET /api/v1/assets/:symbol/price/history", () => {
    it("should return price history data for an asset", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets/USDC/price/history",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("symbol", "USDC");
      expect(body).toHaveProperty("period", "7d");
      expect(body).toHaveProperty("points");
      expect(Array.isArray(body.points)).toBe(true);
    });
  });

  describe("GET /api/v1/assets/:symbol/volume/history", () => {
    it("should return volume history data for an asset", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/assets/USDC/volume/history",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("symbol", "USDC");
      expect(body).toHaveProperty("period", "7d");
      expect(body).toHaveProperty("points");
      expect(Array.isArray(body.points)).toBe(true);
    });
  });
});

