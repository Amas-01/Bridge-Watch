import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { reconciliationRoutes } from "../../src/api/routes/reconciliation.js";

vi.mock("../../src/database/connection.js", () => {
  const mockRecords: any[] = [];
  const mockDb: any = vi.fn().mockImplementation((table?: string) => {
    const builder: any = {
      insert: vi.fn().mockImplementation((data) => {
        const record = { id: "test-zk-uuid-1", ...data, created_at: new Date(), updated_at: new Date() };
        mockRecords.push(record);
        return Promise.resolve([{ id: "test-zk-uuid-1" }]);
      }),
      select: vi.fn().mockImplementation(() => builder),
      where: vi.fn().mockImplementation(() => builder),
      orderBy: vi.fn().mockImplementation(() => builder),
      limit: vi.fn().mockImplementation(() => Promise.resolve(mockRecords)),
      first: vi.fn().mockImplementation(() => Promise.resolve(mockRecords[0] ?? null)),
    };
    return builder;
  });

  return { getDatabase: () => mockDb };
});

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("ZK Proof Verification Routes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await app.register(reconciliationRoutes, { prefix: "/api/v1/reconciliation" });
    await app.ready();
  });

  describe("POST /api/v1/reconciliation/verify-zk-proof", () => {
    it("returns 200 with verified: true for valid Groth16 ZK proof (R >= S)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reconciliation/verify-zk-proof",
        payload: {
          bridgeId: "fobxx-treasury-bridge",
          assetCode: "FOBXX",
          scheme: "groth16",
          curve: "bn254",
          totalReserves: "15000000000",
          onChainSupply: "10000000000",
          minReserveRatioBps: 10000,
          commitmentHash: "a".repeat(64),
          piA: "b".repeat(64),
          piB: "c".repeat(64),
          piC: "d".repeat(64),
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.verified).toBe(true);
      expect(json.verification.isValid).toBe(true);
      expect(json.verification.reserveRatioBps).toBe(15000);
    });

    it("returns 400 when reserves are less than supply (R < S constraint failure)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reconciliation/verify-zk-proof",
        payload: {
          bridgeId: "undercollateralized-bridge",
          assetCode: "USDC",
          scheme: "groth16",
          curve: "bn254",
          totalReserves: "8000000000",
          onChainSupply: "10000000000",
          minReserveRatioBps: 10000,
          commitmentHash: "a".repeat(64),
          piA: "b".repeat(64),
          piB: "c".repeat(64),
          piC: "d".repeat(64),
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error).toBe("ZK proof verification failed");
      expect(json.verification.isValid).toBe(false);
      expect(json.verification.errorReason).toContain("Constraint failed");
    });

    it("returns 400 for invalid request body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reconciliation/verify-zk-proof",
        payload: {
          bridgeId: "",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe("Invalid ZK proof payload");
    });
  });

  describe("POST /api/v1/reconciliation/generate-zk-proof", () => {
    it("generates a ZK reserve proof payload", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/reconciliation/generate-zk-proof",
        payload: {
          bridgeId: "ondo-usdy-bridge",
          assetCode: "USDY",
          totalReserves: "25000000000",
          onChainSupply: "20000000000",
          scheme: "plonk",
          curve: "bls12_381",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.proofPayload).toBeDefined();
      expect(json.proofPayload.scheme).toBe("plonk");
      expect(json.proofPayload.curve).toBe("bls12_381");
      expect(json.proofPayload.commitmentHash).toHaveLength(64);
    });
  });

  describe("GET /api/v1/reconciliation/zk-proofs", () => {
    it("returns verification history list", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/api/v1/reconciliation/zk-proofs?bridgeId=fobxx-treasury-bridge",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().verifications).toBeDefined();
    });
  });
});
