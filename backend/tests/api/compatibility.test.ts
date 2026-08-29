import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import {
  API_CONTRACTS,
  getContractFingerprint,
  getCurrentContract,
  parseRequestedVersion,
} from "../../src/api/compatibility/contracts.js";
import { dualRead, dualWrite } from "../../src/api/compatibility/migration.js";
import { registerCompatibilityMiddleware } from "../../src/api/compatibility/middleware.js";
import { compatibilityRoutes } from "../../src/api/compatibility/routes.js";

describe("API compatibility contracts", () => {
  it("selects an explicit version before the Accept media type", () => {
    expect(parseRequestedVersion({
      "x-api-version": "v1",
      accept: "application/vnd.bridge-watch.v1+json",
    })).toBe("v1");
  });

  it("creates stable fingerprints for the shared contract", () => {
    expect(getContractFingerprint(getCurrentContract())).toMatch(/^[a-f0-9]{64}$/);
    expect(getContractFingerprint(API_CONTRACTS[0])).toBe(getContractFingerprint(API_CONTRACTS[0]));
  });

  it("supports dual-read and dual-write migrations", () => {
    const target: Record<string, unknown> = {};
    dualWrite(target, "42.50", "oldAmount", "amount");
    expect(dualRead<string>(target, "oldAmount", "amount")).toBe("42.50");
    expect(target).toEqual({ oldAmount: "42.50", amount: "42.50" });
  });

  it("negotiates response contracts and rejects unsupported versions", async () => {
    const server = Fastify();
    await registerCompatibilityMiddleware(server);
    await server.register(compatibilityRoutes, { prefix: "/api/v1/compatibility" });

    const supported = await server.inject({
      method: "GET",
      url: "/api/v1/compatibility/capabilities",
      headers: { accept: "application/vnd.bridge-watch.v1+json" },
    });
    expect(supported.statusCode).toBe(200);
    expect(supported.headers["x-api-version"]).toBe("v1");
    expect(supported.headers["x-api-contract"]).toMatch(/^[a-f0-9]{64}$/);

    const unsupported = await server.inject({
      method: "GET",
      url: "/api/v1/compatibility/contract",
      headers: { "x-api-version": "v99" },
    });
    expect(unsupported.statusCode).toBe(406);
    expect(unsupported.json().error).toBe("UNSUPPORTED_API_VERSION");

    await server.close();
  });
});
