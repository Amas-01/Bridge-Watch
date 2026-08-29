import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
});

const mockEntry = {
  id: "e1",
  errorCode: "BRIDGE_TIMEOUT",
  title: "Bridge Timeout",
  messageTemplate: "Connection to {bridge} timed out",
  httpStatus: 504,
  severity: "error",
  category: "network",
  retryGuidance: "Retry after 5s",
  documentationUrl: null,
  isActive: true,
  createdBy: "admin",
  updatedBy: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

vi.mock("../../src/services/errorCatalog.service.js", () => {
  class MockErrorCatalogService {
    private static _instance: MockErrorCatalogService;
    static getInstance() {
      if (!this._instance) this._instance = new MockErrorCatalogService();
      return this._instance;
    }
    listEntries = vi.fn().mockResolvedValue([mockEntry]);
    createEntry = vi.fn().mockResolvedValue(mockEntry);
    updateEntry = vi.fn().mockResolvedValue(mockEntry);
    deactivateEntry = vi.fn().mockResolvedValue(undefined);
    getCatalogEntry = vi.fn().mockResolvedValue(mockEntry);
  }
  return { ErrorCatalogService: MockErrorCatalogService };
});

vi.mock("../../src/services/apiKey.service.js", () => {
  class MockApiKeyService {
    validateKey = vi.fn().mockResolvedValue({
      ok: true,
      result: {
        id: "key-1",
        name: "admin",
        scopes: ["admin:error-catalog"],
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

import {
  errorCatalogAdminRoutes,
  errorCatalogPublicRoutes,
} from "../../src/api/routes/errorCatalog.js";

describe("Error catalog routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(errorCatalogAdminRoutes, {
      prefix: "/api/v1/admin/error-catalog",
    });
    await server.register(errorCatalogPublicRoutes, {
      prefix: "/api/v1/error-catalog",
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // Test 18: GET / lists entries; filterable by severity
  it("GET / lists catalog entries", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/error-catalog",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.entries)).toBe(true);
  });

  it("GET / filters by severity", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/error-catalog?severity=error",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("GET / returns 400 for invalid severity", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/admin/error-catalog?severity=nonsense",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(400);
  });

  // Test 19: GET /:errorCode returns entry for authenticated non-admin user
  it("GET /:errorCode returns entry for authenticated user", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/error-catalog/BRIDGE_TIMEOUT",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entry.errorCode).toBe("BRIDGE_TIMEOUT");
  });

  it("GET /:errorCode returns 404 for unknown code", async () => {
    const { ErrorCatalogService } = vi.mocked(
      await import("../../src/services/errorCatalog.service.js")
    );
    const instance = (ErrorCatalogService as unknown as {
      _instance: { getCatalogEntry: ReturnType<typeof vi.fn> };
    })._instance;
    instance.getCatalogEntry.mockResolvedValueOnce(null);

    const res = await server.inject({
      method: "GET",
      url: "/api/v1/error-catalog/UNKNOWN_CODE",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(404);
  });

  // Test 20: POST / returns 409 for duplicate error code
  it("POST / returns 409 for duplicate error code", async () => {
    const { ErrorCatalogService } = vi.mocked(
      await import("../../src/services/errorCatalog.service.js")
    );
    const instance = (ErrorCatalogService as unknown as {
      _instance: { createEntry: ReturnType<typeof vi.fn> };
    })._instance;
    instance.createEntry.mockRejectedValueOnce(
      new Error("Error code already exists: BRIDGE_TIMEOUT")
    );

    const res = await server.inject({
      method: "POST",
      url: "/api/v1/admin/error-catalog",
      headers: {
        "x-api-key": "bootstrap-secret",
        "content-type": "application/json",
      },
      payload: JSON.stringify({
        errorCode: "BRIDGE_TIMEOUT",
        title: "Bridge Timeout",
        messageTemplate: "Timed out",
        httpStatus: 504,
      }),
    });
    expect(res.statusCode).toBe(409);
  });

  it("POST / returns 400 when required fields are missing", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/admin/error-catalog",
      headers: {
        "x-api-key": "bootstrap-secret",
        "content-type": "application/json",
      },
      payload: JSON.stringify({ errorCode: "TEST" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE /:id deactivates an entry", async () => {
    const res = await server.inject({
      method: "DELETE",
      url: "/api/v1/admin/error-catalog/e1",
      headers: { "x-api-key": "bootstrap-secret" },
    });
    expect(res.statusCode).toBe(200);
  });
});
