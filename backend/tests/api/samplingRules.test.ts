import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
});

vi.mock("../../src/services/requestSampling.service.js", () => {
  class MockRequestSamplingService {
    private static _instance: MockRequestSamplingService;
    static getInstance() {
      if (!this._instance) this._instance = new MockRequestSamplingService();
      return this._instance;
    }
    getSamplingRules = vi.fn().mockResolvedValue([
      {
        id: "r1",
        name: "Test rule",
        description: null,
        sampleRate: 0.5,
        target: "all_requests",
        targetValue: null,
        enabled: true,
        priority: 0,
        createdBy: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    createRule = vi.fn().mockResolvedValue({
      id: "r-new",
      name: "New rule",
      description: null,
      sampleRate: 0.8,
      target: "all_requests",
      targetValue: null,
      enabled: true,
      priority: 0,
      createdBy: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    updateRule = vi.fn().mockResolvedValue({ id: "r1", sampleRate: 0.9 });
    deleteRule = vi.fn().mockResolvedValue(undefined);
    evaluateRequest = vi.fn().mockResolvedValue({
      finalDecision: true,
      matchedRuleId: "r1",
      matchedRuleName: "Test rule",
      rules: [],
    });
  }
  return { RequestSamplingService: MockRequestSamplingService };
});

vi.mock("../../src/services/apiKey.service.js", () => {
  class MockApiKeyService {
    validateKey = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        id: "key-1",
        name: "admin",
        scopes: ["admin:sampling"],
        rateLimitPerMinute: 120,
        source: "api-key",
      },
    });
    listKeys = vi.fn().mockResolvedValue([]);
  }
  return { ApiKeyService: MockApiKeyService };
});

vi.mock("../../src/services/oauth2.service.js", () => {
  class MockOAuth2Service {
    verifyToken = vi.fn().mockReturnValue({ valid: false });
    extractScopesFromToken = vi.fn().mockReturnValue([]);
  }
  return { OAuth2Service: MockOAuth2Service };
});

import { samplingRulesRoutes } from "../../src/api/routes/samplingRules.js";

describe("Sampling rules routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(samplingRulesRoutes, {
      prefix: "/api/v1/admin/sampling-rules",
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // Test 7: GET / returns rules; rejects unauthenticated request
  it("GET / returns rules with valid admin key", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/sampling-rules",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.rules)).toBe(true);
  });

  it("GET / returns 401 without auth", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/sampling-rules",
    });
    expect(res.statusCode).toBe(401);
  });

  // Test 8: POST / creates rule; returns 400 for invalid sample_rate
  it("POST / returns 400 for sample_rate > 1", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/admin/sampling-rules",
      headers: {
        "x-api-key": "bootstrap-secret",
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        name: "bad rate",
        sampleRate: 1.5,
        target: "all_requests",
      }),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/0\.0 and 1\.0/);
  });

  it("POST / creates rule successfully with valid input", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/admin/sampling-rules",
      headers: {
        "x-api-key": "bootstrap-secret",
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        name: "New rule",
        sampleRate: 0.8,
        target: "all_requests",
      }),
    });
    expect(res.statusCode).toBe(201);
  });

  // Test 9: DELETE /:id returns 404 for unknown ID
  it("DELETE /:id returns 404 for unknown ID", async () => {
    const { RequestSamplingService } = vi.mocked(
      await import("../../src/services/requestSampling.service.js")
    );
    const instance = (RequestSamplingService as unknown as {
      _instance: { deleteRule: ReturnType<typeof vi.fn> };
    })._instance;
    instance.deleteRule.mockRejectedValueOnce(
      new Error("Sampling rule not found: unknown-id")
    );

    const res = await server.inject({
      method: "DELETE",
      url: "/api/v1/admin/sampling-rules/unknown-id",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(404);
  });

  // Test 10: GET /evaluate returns correct decision for mock request
  it("GET /evaluate returns sampling decision for mock request", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/sampling-rules/evaluate?id=req-001&url=/api/test",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("finalDecision");
  });

  it("GET /evaluate returns 400 when id is missing", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/sampling-rules/evaluate?url=/api/test",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(400);
  });
});
