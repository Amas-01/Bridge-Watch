import { describe, it, expect, beforeEach, vi } from "vitest";
import { ZkReserveProofService, type ZkProofPayload } from "../zkReserveProof.service.js";

vi.mock("../../database/connection.js", () => {
  const mockRecords: any[] = [];
  const mockDb: any = vi.fn().mockImplementation((table?: string) => {
    const builder: any = {
      insert: vi.fn().mockImplementation((data) => {
        const record = { id: "test-uuid-1234", ...data, created_at: new Date(), updated_at: new Date() };
        mockRecords.push(record);
        return Promise.resolve([{ id: "test-uuid-1234" }]);
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

describe("ZkReserveProofService", () => {
  let service: ZkReserveProofService;

  beforeEach(() => {
    service = new ZkReserveProofService();
    vi.clearAllMocks();
  });

  describe("generateReserveProof", () => {
    it("generates a valid ZK proof payload for Groth16 scheme when R >= S", () => {
      const payload = service.generateReserveProof({
        bridgeId: "fobxx-treasury-bridge",
        assetCode: "FOBXX",
        totalReserves: "15000000000",
        onChainSupply: "10000000000",
        scheme: "groth16",
        curve: "bn254",
      });

      expect(payload.bridgeId).toBe("fobxx-treasury-bridge");
      expect(payload.assetCode).toBe("FOBXX");
      expect(payload.scheme).toBe("groth16");
      expect(payload.curve).toBe("bn254");
      expect(payload.totalReserves).toBe("15000000000");
      expect(payload.onChainSupply).toBe("10000000000");
      expect(payload.commitmentHash).toHaveLength(64);
      expect(payload.piA).toBeDefined();
      expect(payload.piB).toBeDefined();
      expect(payload.piC).toBeDefined();
    });

    it("generates a valid PLONK proof payload with custodian leaves", () => {
      const payload = service.generateReserveProof({
        bridgeId: "ondo-usdy-bridge",
        assetCode: "USDY",
        totalReserves: "25000000000",
        onChainSupply: "20000000000",
        scheme: "plonk",
        curve: "bls12_381",
        custodianLeaves: [
          { accountId: "bank_acct_001", balance: "15000000000", nonce: "n1" },
          { accountId: "bank_acct_002", balance: "10000000000", nonce: "n2" },
        ],
      });

      expect(payload.scheme).toBe("plonk");
      expect(payload.curve).toBe("bls12_381");
      expect(payload.commitmentHash).toHaveLength(64);
    });

    it("throws error for negative reserve or supply inputs", () => {
      expect(() =>
        service.generateReserveProof({
          bridgeId: "invalid-bridge",
          assetCode: "USDC",
          totalReserves: "-100",
          onChainSupply: "1000",
        })
      ).toThrow("Reserves and supply must be non-negative");
    });
  });

  describe("verifyReserveProofOffChain", () => {
    it("successfully verifies valid proof with total reserves >= supply", async () => {
      const payload: ZkProofPayload = service.generateReserveProof({
        bridgeId: "fobxx-treasury-bridge",
        assetCode: "FOBXX",
        totalReserves: "15000000000",
        onChainSupply: "10000000000",
        minReserveRatioBps: 10000,
      });

      const result = await service.verifyReserveProofOffChain(payload);

      expect(result.isValid).toBe(true);
      expect(result.reserveRatioBps).toBe(15000);
      expect(result.errorReason).toBeNull();
    });

    it("rejects proof when reserves are less than supply (R < S constraint failure)", async () => {
      const payload: ZkProofPayload = {
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
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await service.verifyReserveProofOffChain(payload);

      expect(result.isValid).toBe(false);
      expect(result.errorReason).toContain("Constraint failed");
    });

    it("rejects proof when reserve ratio is below minimum required bps", async () => {
      const payload: ZkProofPayload = {
        bridgeId: "ratio-test-bridge",
        assetCode: "USDC",
        scheme: "groth16",
        curve: "bn254",
        totalReserves: "10500000000",
        onChainSupply: "10000000000",
        minReserveRatioBps: 11000,
        commitmentHash: "a".repeat(64),
        piA: "b".repeat(64),
        piB: "c".repeat(64),
        piC: "d".repeat(64),
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await service.verifyReserveProofOffChain(payload);

      expect(result.isValid).toBe(false);
      expect(result.errorReason).toContain("below minimum required");
    });

    it("rejects proof with missing SNARK components", async () => {
      const payload: ZkProofPayload = {
        bridgeId: "incomplete-proof-bridge",
        assetCode: "USDC",
        scheme: "groth16",
        curve: "bn254",
        totalReserves: "15000000000",
        onChainSupply: "10000000000",
        minReserveRatioBps: 10000,
        commitmentHash: "a".repeat(64),
        piA: "",
        piB: "c".repeat(64),
        piC: "d".repeat(64),
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await service.verifyReserveProofOffChain(payload);

      expect(result.isValid).toBe(false);
      expect(result.errorReason).toContain("Missing or empty SNARK proof components");
    });

    it("rejects proof with invalid commitment hash length", async () => {
      const payload: ZkProofPayload = {
        bridgeId: "bad-hash-bridge",
        assetCode: "USDC",
        scheme: "groth16",
        curve: "bn254",
        totalReserves: "15000000000",
        onChainSupply: "10000000000",
        minReserveRatioBps: 10000,
        commitmentHash: "invalid_short_hash",
        piA: "b".repeat(64),
        piB: "c".repeat(64),
        piC: "d".repeat(64),
        timestamp: Math.floor(Date.now() / 1000),
      };

      const result = await service.verifyReserveProofOffChain(payload);

      expect(result.isValid).toBe(false);
      expect(result.errorReason).toContain("Invalid commitment hash");
    });
  });
});
