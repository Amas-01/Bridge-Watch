import { beforeEach, describe, expect, it } from "vitest";
import { ApiKeyService } from "../../src/services/apiKey.service.js";

describe("ApiKeyService", () => {
  let service: ApiKeyService;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.API_KEY_BOOTSTRAP_TOKEN = "bootstrap-secret";
    service = new ApiKeyService();
  });

  it("creates and validates an API key", async () => {
    const created = await service.createKey({
      name: "Integrator",
      scopes: ["jobs:read"],
      createdBy: "tester",
    });

    expect(created.apiKey.startsWith("bwk_live_")).toBe(true);

    const validated = await service.validateKey(created.apiKey, ["jobs:read"], "127.0.0.1");
    expect(validated.ok).toBe(true);
    expect(validated.ok && validated.result.name).toBe("Integrator");
  });

  it("distinguishes an insufficient scope from an invalid key", async () => {
    const created = await service.createKey({
      name: "Read only",
      scopes: ["jobs:read"],
      createdBy: "tester",
    });

    const wrongScope = await service.validateKey(created.apiKey, ["jobs:trigger"]);
    expect(wrongScope).toEqual({ ok: false, reason: "insufficient_scope" });

    const wrongKey = await service.validateKey("bwk_live_does-not-exist", ["jobs:read"]);
    expect(wrongKey).toEqual({ ok: false, reason: "invalid_key" });
  });

  it("rotates and revokes keys", async () => {
    const created = await service.createKey({
      name: "Rotate me",
      scopes: ["admin:api-keys"],
      createdBy: "tester",
    });

    const rotated = await service.rotateKey(created.key.id, "tester");
    expect(rotated.apiKey).not.toBe(created.apiKey);

    const revoked = await service.revokeKey(created.key.id, "tester");
    expect(revoked.revokedAt).not.toBeNull();

    const validated = await service.validateKey(rotated.apiKey, ["admin:api-keys"]);
    expect(validated).toEqual({ ok: false, reason: "invalid_key" });
  });
});
