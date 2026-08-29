import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import { getDatabase } from "../../src/database/connection.js";
import { SignedRequestVerificationService } from "../../src/services/signedRequestVerification.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

let currentChain: Record<string, unknown> = {};

function makeKeyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sk-1",
    key_id: "key_test_123",
    secret: "testsecret1234567890123456789012",
    algorithm: "hmac-sha256",
    owner: "test-client",
    max_clock_skew_seconds: 300,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeChain(rows: unknown[] = [], updated?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockImplementation(() => chain);
  chain.first = vi.fn().mockResolvedValue(rows[0]);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue([updated ?? rows[0] ?? makeKeyRow()]);
  chain.then = vi.fn().mockImplementation((resolve) => { resolve(rows); return Promise.resolve(); });
  currentChain = chain;
  return chain;
}

function dbMock() {
  const dbFn = vi.fn().mockImplementation((_table: string) => currentChain);
  (dbFn as unknown as Record<string, unknown>).fn = { now: () => new Date().toISOString() };
  return dbFn as never;
}

describe("SignedRequestVerificationService", () => {
  let service: SignedRequestVerificationService;

  beforeEach(() => {
    service = new SignedRequestVerificationService();
    makeChain([makeKeyRow()]);
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("lists active request signing keys", async () => {
    const keys = await service.listKeys(true);
    expect(keys).toHaveLength(1);
    expect(keys[0].keyId).toBe("key_test_123");
  });

  it("creates a new signing key", async () => {
    makeChain([], makeKeyRow({ owner: "billing" }));
    const key = await service.createKey({ owner: "billing" });
    expect(key.owner).toBe("billing");
  });

  it("verifies valid signature successfully", async () => {
    const secret = "testsecret1234567890123456789012";
    const timestamp = Date.now();
    const method = "POST";
    const path = "/api/v1/resource";
    const body = { test: true };
    const stringToSign = `${method}:${path}:${timestamp}:${JSON.stringify(body)}`;
    const signature = crypto.createHmac("sha256", secret).update(stringToSign).digest("hex");

    makeChain([makeKeyRow({ secret })]);

    const res = await service.verifySignature({
      keyId: "key_test_123",
      method,
      path,
      timestamp,
      signature,
      body,
    });

    expect(res.valid).toBe(true);
    expect(res.status).toBe("valid");
  });

  it("rejects expired timestamp", async () => {
    const expiredTimestamp = Date.now() - 400000; // 400s > 300s limit
    makeChain([makeKeyRow()]);

    const res = await service.verifySignature({
      keyId: "key_test_123",
      method: "GET",
      path: "/api/v1/resource",
      timestamp: expiredTimestamp,
      signature: "dummy",
    });

    expect(res.valid).toBe(false);
    expect(res.status).toBe("timestamp_expired");
  });

  it("rejects missing key", async () => {
    makeChain([], undefined);

    const res = await service.verifySignature({
      keyId: "missing_key",
      method: "GET",
      path: "/api/v1/resource",
      timestamp: Date.now(),
      signature: "dummy",
    });

    expect(res.valid).toBe(false);
    expect(res.status).toBe("key_not_found");
  });
});
