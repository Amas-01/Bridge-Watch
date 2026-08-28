import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
});

const sampleRecord = {
  id: "resp-1",
  sourceKey: "coingecko",
  endpoint: "simple/price",
  method: "GET",
  requestParams: { ids: "stellar" },
  outcome: "ok",
  statusCode: 200,
  latencyMs: 40,
  errorMessage: null,
  contentType: "application/json",
  bodyTruncated: false,
  bodyHash: "abc",
  bodyBytes: 12,
  collectionRunId: "run-1",
  subject: "XLM",
  collectedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-31T00:00:00.000Z",
  responseBody: '{"stellar":{"usd":0.11}}',
};

const svc = vi.hoisted(() => ({
  list: vi.fn(),
  stats: vi.fn(),
  get: vi.fn(),
  setRetention: vi.fn(),
  pruneExpired: vi.fn(),
}));

vi.mock("../../src/services/externalSourceResponseArchive.service.js", () => ({
  externalSourceResponseArchiveService: svc,
}));

const authState = vi.hoisted(() => ({ scopes: ["archive:read", "admin:config"] }));

vi.mock("../../src/services/apiKey.service.js", () => {
  class MockApiKeyService {
    validateKey = vi.fn().mockImplementation((_key: string, required: string[] = []) => {
      const ok = required.every((s) => authState.scopes.includes(s));
      return Promise.resolve(
        ok
          ? {
              ok: true,
              result: {
                id: "key-1",
                name: "admin",
                scopes: authState.scopes,
                rateLimitPerMinute: 120,
                source: "api-key",
              },
            }
          : { ok: false, reason: "insufficient_scope" }
      );
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

import { externalSourceResponseArchiveRoutes } from "../../src/api/routes/externalSourceResponseArchive.routes.js";

const auth = { "x-api-key": "bootstrap-secret" };

describe("External Source Response Archive routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    server.addSchema({ $id: "Error", type: "object", additionalProperties: true });
    server.setErrorHandler((err, _req, reply) => {
      reply.code(reply.statusCode >= 400 ? reply.statusCode : 500).send({ error: err.message });
    });
    server.setValidatorCompiler(() => () => true);
    await server.register(externalSourceResponseArchiveRoutes, {
      prefix: "/api/v1/sources/response-archive",
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    authState.scopes = ["archive:read", "admin:config"];
    vi.clearAllMocks();
    svc.list.mockResolvedValue({ items: [sampleRecord], nextCursor: null });
    svc.stats.mockResolvedValue({
      total: 1,
      byOutcome: { ok: 1 },
      bySource: { coingecko: 1 },
      oldestCollectedAt: "2026-01-01T00:00:00.000Z",
      expiredPending: 0,
    });
    svc.get.mockResolvedValue(sampleRecord);
    svc.setRetention.mockResolvedValue({ ...sampleRecord, expiresAt: null });
    svc.pruneExpired.mockResolvedValue(3);
  });

  it("rejects unauthenticated reads", async () => {
    const res = await server.inject({ method: "GET", url: "/api/v1/sources/response-archive/" });
    expect(res.statusCode).toBe(401);
  });

  it("lists archived responses for an authorized caller", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/sources/response-archive/?sourceKey=coingecko&limit=10",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.items).toHaveLength(1);
    expect(svc.list).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKey: "coingecko", limit: 10 })
    );
  });

  it("rejects an invalid outcome filter", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/sources/response-archive/?outcome=banana",
      headers: auth,
    });
    expect(res.statusCode).toBe(400);
  });

  it("omits the body from the metadata view and serves it on /body", async () => {
    const meta = await server.inject({
      method: "GET",
      url: "/api/v1/sources/response-archive/resp-1",
      headers: auth,
    });
    expect(meta.statusCode).toBe(200);
    expect(JSON.parse(meta.body)).not.toHaveProperty("responseBody");

    const body = await server.inject({
      method: "GET",
      url: "/api/v1/sources/response-archive/resp-1/body",
      headers: auth,
    });
    expect(JSON.parse(body.body).responseBody).toBe(sampleRecord.responseBody);
  });

  it("returns 404 for a missing response", async () => {
    svc.get.mockResolvedValueOnce(null);
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/sources/response-archive/missing",
      headers: auth,
    });
    expect(res.statusCode).toBe(404);
  });

  it("requires admin:config to place a legal hold", async () => {
    authState.scopes = ["archive:read"];
    const res = await server.inject({
      method: "PATCH",
      url: "/api/v1/sources/response-archive/resp-1/retention",
      headers: auth,
      payload: { retentionDays: null },
    });
    expect(res.statusCode).toBe(403);
  });

  it("places a legal hold with admin:config", async () => {
    const res = await server.inject({
      method: "PATCH",
      url: "/api/v1/sources/response-archive/resp-1/retention",
      headers: auth,
      payload: { retentionDays: null },
    });
    expect(res.statusCode).toBe(200);
    expect(svc.setRetention).toHaveBeenCalledWith("resp-1", null);
  });

  it("rejects an out-of-range retention", async () => {
    const res = await server.inject({
      method: "PATCH",
      url: "/api/v1/sources/response-archive/resp-1/retention",
      headers: auth,
      payload: { retentionDays: 100000 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("runs a prune sweep on demand", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/v1/sources/response-archive/prune",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: 3 });
  });

  it("exposes aggregate stats", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/api/v1/sources/response-archive/stats",
      headers: auth,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).total).toBe(1);
  });
});
