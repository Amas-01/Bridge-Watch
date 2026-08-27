import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
  process.env.REQUIRE_APPROVAL_FOR_ROLLBACK = "false";
});

const mockVersion = {
  id: "v1",
  configKey: "alert-thresholds",
  versionNumber: 2,
  payload: { priceDeviation: 0.05 },
  changeSummary: "Increased threshold",
  appliedBy: "admin",
  appliedAt: new Date().toISOString(),
  isCurrent: true,
};

const mockPreview = {
  configKey: "alert-thresholds",
  currentVersion: 2,
  targetVersion: 1,
  diff: [
    {
      field: "priceDeviation",
      currentValue: 0.05,
      targetValue: 0.02,
      changeType: "modified",
    },
  ],
  impactSummary: "Rolling back 'alert-thresholds' from v2 to v1: 1 field(s) modified.",
};

vi.mock("../../src/services/configVersion.service.js", () => {
  class MockConfigVersionService {
    private static _instance: MockConfigVersionService;
    static getInstance() {
      if (!this._instance) this._instance = new MockConfigVersionService();
      return this._instance;
    }
    getVersionHistory = vi.fn().mockResolvedValue([mockVersion]);
    getCurrentVersion = vi.fn().mockResolvedValue(mockVersion);
    getVersion = vi.fn().mockResolvedValue(mockVersion);
    previewRollback = vi.fn().mockResolvedValue(mockPreview);
    applyRollback = vi
      .fn()
      .mockResolvedValue({ ...mockVersion, versionNumber: 3, isCurrent: true });
    createVersion = vi.fn().mockResolvedValue(mockVersion);
    computeDiff = vi.fn().mockReturnValue([]);
  }
  return { ConfigVersionService: MockConfigVersionService };
});

vi.mock("../../src/services/apiKey.service.js", () => {
  class MockApiKeyService {
    validateKey = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        id: "key-1",
        name: "admin",
        scopes: ["admin:config-versions"],
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

import { configVersionsRoutes } from "../../src/api/routes/configVersions.js";

describe("Config versions routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(configVersionsRoutes, {
      prefix: "/api/v1/admin/config-versions",
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // Test 40: GET /:configKey/rollback-preview/:targetVersion returns structured diff
  it("GET rollback-preview returns structured diff", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/config-versions/alert-thresholds/rollback-preview/1",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("diff");
    expect(body).toHaveProperty("impactSummary");
    expect(body).toHaveProperty("currentVersion");
    expect(body).toHaveProperty("targetVersion");
  });

  // Test 41: Rolling back to the current version is rejected with a clear error
  it("GET rollback-preview returns 400 when rolling back to current version", async () => {
    const { ConfigVersionService } = vi.mocked(
      await import("../../src/services/configVersion.service.js")
    );
    const instance = (ConfigVersionService as unknown as {
      _instance: { previewRollback: ReturnType<typeof vi.fn> };
    })._instance;
    instance.previewRollback.mockRejectedValueOnce(
      new Error("Target version 2 is already the current version.")
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/config-versions/alert-thresholds/rollback-preview/2",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).message).toMatch(/current version/);
  });

  // Test 42: Rolling back to a non-existent version returns 404
  it("GET rollback-preview returns 404 for non-existent version", async () => {
    const { ConfigVersionService } = vi.mocked(
      await import("../../src/services/configVersion.service.js")
    );
    const instance = (ConfigVersionService as unknown as {
      _instance: { previewRollback: ReturnType<typeof vi.fn> };
    })._instance;
    instance.previewRollback.mockRejectedValueOnce(
      new Error("Version 999 not found for config key: alert-thresholds.")
    );

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/config-versions/alert-thresholds/rollback-preview/999",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(404);
  });

  it("GET /:configKey returns version history", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/config-versions/alert-thresholds",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.versions)).toBe(true);
  });

  it("GET /:configKey/current returns the current version", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/config-versions/alert-thresholds/current",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).version.isCurrent).toBe(true);
  });

  it("POST /:configKey/rollback/:targetVersion applies rollback", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/admin/config-versions/alert-thresholds/rollback/1",
      headers: {
        "x-api-key": "bootstrap-secret",
        "content-type": "application/json",
      },
      payload: JSON.stringify({}),
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).version.versionNumber).toBe(3);
  });
});
