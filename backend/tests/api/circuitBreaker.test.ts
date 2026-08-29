import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

const circuitBreakerServiceMock = vi.hoisted(() => ({
  isPaused: vi.fn(),
  isWhitelistedAddress: vi.fn(),
  isWhitelistedAsset: vi.fn(),
  triggerPause: vi.fn(),
  requestRecovery: vi.fn(),
}));

const actionEngineMock = vi.hoisted(() => ({
  getAllActionConfigs: vi.fn().mockResolvedValue([]),
  getActionConfigById: vi.fn().mockResolvedValue(null),
  createActionConfig: vi.fn().mockResolvedValue({ id: "act-1" }),
  updateActionConfig: vi.fn().mockResolvedValue({ id: "act-1" }),
  deleteActionConfig: vi.fn().mockResolvedValue(true),
  executeSingleAction: vi.fn().mockResolvedValue({ id: "log-1", status: "success" }),
  getActionLogs: vi.fn().mockResolvedValue({ logs: [], total: 0 }),
}));

vi.mock("../../src/services/circuitBreakerActionEngine.service.js", () => ({
  circuitBreakerActionEngine: actionEngineMock,
  CircuitBreakerActionEngine: class {},
}));

vi.mock("../../src/services/circuitBreaker.service.js", () => ({
  getCircuitBreakerService: () => circuitBreakerServiceMock,
  CircuitBreakerService: class {},
  PauseScope: {
    Global: 0,
    Bridge: 1,
    Asset: 2,
  },
  PauseLevel: {
    None: 0,
    Warning: 1,
    Partial: 2,
    Full: 3,
  },
}));

describe("Circuit Breaker API", () => {
  let server: FastifyInstance;

  beforeEach(() => {
    Object.values(circuitBreakerServiceMock).forEach((mock) => mock.mockReset());
    circuitBreakerServiceMock.isPaused.mockResolvedValue(false);
    circuitBreakerServiceMock.isWhitelistedAddress.mockResolvedValue(false);
    circuitBreakerServiceMock.isWhitelistedAsset.mockResolvedValue(false);
  });

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("GET /api/v1/circuit-breaker/status", () => {
    it("should return 400 when scope is missing", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/circuit-breaker/status",
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return 400 for invalid scope", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/circuit-breaker/status?scope=invalid",
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return pause status for global scope", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/circuit-breaker/status?scope=global",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("paused");
      expect(typeof body.paused).toBe("boolean");
    });

    it("should return 400 for bridge scope without identifier", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/circuit-breaker/status?scope=bridge",
      });

      expect(response.statusCode).toBe(400);
    });

    it("should return status for bridge scope with identifier", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/circuit-breaker/status?scope=bridge&identifier=test-bridge",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("paused");
    });
  });

  describe("GET /api/v1/circuit-breaker/whitelist", () => {
    it("should return 400 for invalid whitelist query", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/circuit-breaker/whitelist",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("POST /api/v1/circuit-breaker/pause", () => {
    it("should return 501 as not implemented", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/circuit-breaker/pause",
        payload: { scope: "global", reason: "test" },
      });

      expect(response.statusCode).toBe(501);
    });
  });

  describe("POST /api/v1/circuit-breaker/recovery", () => {
    it("should return 501 as not implemented", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/circuit-breaker/recovery",
        payload: { pauseId: 1 },
      });

      expect(response.statusCode).toBe(501);
    });
  });

  describe("GET /api/v1/circuit-breaker/actions", () => {
    it("should return list of remediation action configs", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/circuit-breaker/actions",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("actions");
      expect(Array.isArray(body.actions)).toBe(true);
    });
  });

  describe("GET /api/v1/circuit-breaker/action-logs", () => {
    it("should return execution audit logs", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/circuit-breaker/action-logs",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("logs");
      expect(body).toHaveProperty("total");
    });
  });
});

