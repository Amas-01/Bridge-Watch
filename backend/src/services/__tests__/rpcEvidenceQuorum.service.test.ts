import { describe, it, expect, beforeEach, vi } from "vitest";
import { RpcEvidenceQuorumService, type ProviderResponseInput } from "../rpcEvidenceQuorum.service.js";

vi.mock("../database/connection.js", () => {
  const mockDb: any = vi.fn().mockImplementation(() => mockDb);
  mockDb.schema = {
    hasTable: vi.fn().mockResolvedValue(true),
  };
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.update = vi.fn().mockResolvedValue([1]);
  mockDb.insert = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "test-config-uuid" }]),
  });
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.first = vi.fn().mockResolvedValue(null);
  mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
  mockDb.limit = vi.fn().mockResolvedValue([]);
  return { getDatabase: () => mockDb };
});

describe("RpcEvidenceQuorumService", () => {
  let service: RpcEvidenceQuorumService;

  beforeEach(() => {
    service = new RpcEvidenceQuorumService();
    vi.clearAllMocks();
  });

  it("derives provider group from URL hostname correctly", () => {
    expect(service.deriveProviderGroup("https://mainnet.infura.io/v3/key")).toBe("infura");
    expect(service.deriveProviderGroup("https://eth-mainnet.g.alchemy.com/v2/key")).toBe("alchemy");
    expect(service.deriveProviderGroup("https://horizon.stellar.org")).toBe("stellar-foundation");
    expect(service.deriveProviderGroup("https://custom-node.example.com", "custom-group")).toBe("custom-group");
  });

  it("computes clean consensus across 3 independent provider groups", async () => {
    const responses: ProviderResponseInput[] = [
      {
        endpoint: "https://mainnet.infura.io/v3/key",
        blockNumber: 18000000,
        blockHash: "0xhash123",
        stateRoot: "0xstateroot1",
        data: { reserveBalance: "1000000" },
      },
      {
        endpoint: "https://eth-mainnet.g.alchemy.com/v2/key",
        blockNumber: 18000000,
        blockHash: "0xhash123",
        stateRoot: "0xstateroot1",
        data: { reserveBalance: "1000000" },
      },
      {
        endpoint: "https://rpc.ankr.com/eth",
        blockNumber: 18000000,
        blockHash: "0xhash123",
        stateRoot: "0xstateroot1",
        data: { reserveBalance: "1000000" },
      },
    ];

    const result = await service.evaluateQuorum({
      chainId: "ethereum-mainnet",
      operationType: "reserve_read",
      readIdentifier: "USDC-lock-contract",
      responses,
    });

    expect(result.accepted).toBe(true);
    expect(result.decision).toBe("ACCEPTED");
    expect(result.confidenceScore).toBe(1.0);
    expect(result.isDegraded).toBe(false);
    expect(result.independentGroupsCount).toBe(3);
    expect(result.agreedGroupsCount).toBe(3);
    expect(result.headerAnchor?.canonicalBlockNumber).toBe(18000000);
    expect(result.headerAnchor?.canonicalBlockHash).toBe("0xhash123");
    expect(result.agreedData).toEqual({ reserveBalance: "1000000" });
  });

  it("deduplicates correlated nodes under the same provider group", async () => {
    const responses: ProviderResponseInput[] = [
      {
        endpoint: "https://mainnet-1.infura.io/v3/key",
        providerGroup: "infura",
        blockNumber: 18000000,
        blockHash: "0xhash123",
        data: "100",
      },
      {
        endpoint: "https://mainnet-2.infura.io/v3/key",
        providerGroup: "infura",
        blockNumber: 18000000,
        blockHash: "0xhash123",
        data: "100",
      },
    ];

    const result = await service.evaluateQuorum({
      chainId: "ethereum-mainnet",
      operationType: "reserve_read",
      readIdentifier: "USDC-contract",
      responses,
      minQuorumSize: 2,
    });

    // 2 Infura nodes count as 1 independent provider group
    expect(result.independentGroupsCount).toBe(1);
    expect(result.isDegraded).toBe(true);
    expect(result.confidenceScore).toBeLessThan(1.0);
  });

  it("detects lag and divergent provider responses, flagging degraded confidence", async () => {
    const responses: ProviderResponseInput[] = [
      {
        endpoint: "https://mainnet.infura.io",
        blockNumber: 18000010,
        blockHash: "0xhashA",
        data: { val: 100 },
      },
      {
        endpoint: "https://alchemy.com",
        blockNumber: 18000010,
        blockHash: "0xhashA",
        data: { val: 100 },
      },
      {
        endpoint: "https://lagging-node.com",
        blockNumber: 18000000, // 10 blocks behind tip
        blockHash: "0xoldhash",
        data: { val: 90 },
      },
    ];

    const result = await service.evaluateQuorum({
      chainId: "ethereum-mainnet",
      operationType: "contract_read",
      readIdentifier: "USDT-vault",
      responses,
      maxLagBlocks: 5,
    });

    expect(result.hasExcessiveLag).toBe(true);
    expect(result.disagreementDetails.laggingProviders).toContain("https://lagging-node.com");
    expect(result.isDegraded).toBe(true);
    expect(result.confidenceScore).toBeLessThan(1.0);
  });

  it("enforces fail-closed behavior when configured and quorum fails", async () => {
    const responses: ProviderResponseInput[] = [
      {
        endpoint: "https://node1.com",
        blockNumber: 100,
        blockHash: "0xA",
        data: 10,
      },
      {
        endpoint: "https://node2.com",
        blockNumber: 100,
        blockHash: "0xB",
        data: 20, // Disagreement
      },
    ];

    await expect(
      service.evaluateQuorum({
        chainId: "ethereum-mainnet",
        operationType: "critical_read",
        readIdentifier: "vault-balance",
        responses,
        overrideFailClosed: true,
        minQuorumSize: 2,
      })
    ).rejects.toThrow("RPC Evidence Quorum rejected read");
  });
});
