import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-jwt-secret";
});

import { authMiddleware } from "../../src/api/middleware/auth.js";
import { ApiKeyService } from "../../src/services/apiKey.service.js";

describe("authMiddleware", () => {
  let server: FastifyInstance;
  const apiKeyService = new ApiKeyService();

  beforeAll(async () => {
    server = Fastify();

    server.get(
      "/open",
      { preHandler: authMiddleware() },
      async () => ({ ok: true })
    );

    server.get(
      "/scoped",
      { preHandler: authMiddleware({ requiredScopes: ["reports:read"] }) },
      async () => ({ ok: true })
    );

    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("returns 401 when no credentials are provided", async () => {
    const response = await server.inject({ method: "GET", url: "/open" });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe("Unauthorized");
  });

  it("returns 401 for an unrecognized API key", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/open",
      headers: { "x-api-key": "bwk_live_does-not-exist" },
    });
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe("Unauthorized");
  });

  it("returns 403 when an API key is missing a required scope", async () => {
    const created = await apiKeyService.createKey({
      name: "Reports viewer",
      scopes: ["reports:write"],
      createdBy: "tester",
    });

    const response = await server.inject({
      method: "GET",
      url: "/scoped",
      headers: { "x-api-key": created.apiKey },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toBe("Forbidden");
  });

  it("authenticates successfully with a valid API key and sufficient scope", async () => {
    const created = await apiKeyService.createKey({
      name: "Reports reader",
      scopes: ["reports:read"],
      createdBy: "tester",
    });

    const response = await server.inject({
      method: "GET",
      url: "/scoped",
      headers: { "x-api-key": created.apiKey },
    });

    expect(response.statusCode).toBe(200);
  });

  it("returns 429 when the API key's rate limit is exceeded", async () => {
    const created = await apiKeyService.createKey({
      name: "Low limit",
      scopes: [],
      createdBy: "tester",
      rateLimitPerMinute: 1,
    });

    const first = await server.inject({
      method: "GET",
      url: "/open",
      headers: { "x-api-key": created.apiKey },
    });
    expect(first.statusCode).toBe(200);

    const second = await server.inject({
      method: "GET",
      url: "/open",
      headers: { "x-api-key": created.apiKey },
    });

    expect(second.statusCode).toBe(429);
    expect(JSON.parse(second.body).error).toBe("Too Many Requests");
  });

  it("returns 401 for an invalid bearer token", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/open",
      headers: { authorization: "Bearer not-a-real-token" },
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe("Unauthorized");
  });
});
