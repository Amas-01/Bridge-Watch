import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.hoisted(() => {
  process.env.NODE_ENV = "test";
  process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
});

import { apiKeysRoutes } from "../../src/api/routes/apiKeys.js";

describe("API key routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = Fastify();
    await server.register(apiKeysRoutes, { prefix: "/api/v1/admin/api-keys" });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("creates and lists API keys with the bootstrap token", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/v1/admin/api-keys",
      headers: {
        "x-api-key": "bootstrap-secret",
      },
      payload: {
        name: "Ops automation",
        scopes: ["jobs:read", "jobs:trigger"],
        rateLimitPerMinute: 45,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = JSON.parse(createResponse.body);
    expect(created).toHaveProperty("apiKey");
    expect(created.key.name).toBe("Ops automation");

    const listResponse = await server.inject({
      method: "GET",
      url: "/api/v1/admin/api-keys",
      headers: {
        "x-api-key": "bootstrap-secret",
      },
    });

    expect(listResponse.statusCode).toBe(200);
    const listed = JSON.parse(listResponse.body);
    expect(Array.isArray(listed.keys)).toBe(true);
    expect(listed.keys.length).toBeGreaterThan(0);
  });

  it("returns 401 Unauthorized when the x-api-key header is missing", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/admin/api-keys",
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe("Unauthorized");
  });

  it("returns 401 Unauthorized for an unrecognized API key", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/v1/admin/api-keys",
      headers: {
        "x-api-key": "bwk_live_does-not-exist",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).error).toBe("Unauthorized");
  });

  it("returns 403 Forbidden when the API key lacks the required scope", async () => {
    const createResponse = await server.inject({
      method: "POST",
      url: "/api/v1/admin/api-keys",
      headers: {
        "x-api-key": "bootstrap-secret",
      },
      payload: {
        name: "No admin scope",
        scopes: ["jobs:read"],
      },
    });

    const created = JSON.parse(createResponse.body);

    const response = await server.inject({
      method: "GET",
      url: "/api/v1/admin/api-keys",
      headers: {
        "x-api-key": created.apiKey,
      },
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toBe("Forbidden");
  });
});
