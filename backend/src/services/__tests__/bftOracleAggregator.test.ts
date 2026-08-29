import { describe, it, expect, beforeEach, vi } from "vitest";
import { BftOracleAggregatorService, type OracleReport, type OracleProviderNode } from "../bftOracleAggregator.service.js";

vi.mock("../database/connection.js", () => {
  const mockDb: any = vi.fn().mockImplementation(() => mockDb);
  mockDb.schema = {
    hasTable: vi.fn().mockResolvedValue(true),
  };
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.update = vi.fn().mockResolvedValue(1);
  mockDb.insert = vi.fn().mockResolvedValue([1]);
  mockDb.select = vi.fn().mockResolvedValue([]);
  mockDb.first = vi.fn().mockResolvedValue(null);
  mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
  mockDb.limit = vi.fn().mockResolvedValue([]);
  mockDb.raw = vi.fn((str) => str);
  mockDb.fn = { now: () => new Date().toISOString() };
  return { getDatabase: () => mockDb };
});

vi.mock("../providerHealthRegistry.service.js", () => {
  return {
    providerHealthRegistryService: {
      flagAndSlashProvider: vi.fn().mockResolvedValue(true),
    },
  };
});

describe("BftOracleAggregatorService", () => {
  let service: BftOracleAggregatorService;

  beforeEach(() => {
    service = new BftOracleAggregatorService("test-secret-key");
    vi.clearAllMocks();
  });

  const generateNodes = (count: number): OracleProviderNode[] => {
    return Array.from({ length: count }, (_, i) => ({
      providerKey: `oracle_node_${i + 1}`,
      displayName: `Oracle Node ${i + 1}`,
      publicKey: `pubkey_oracle_node_${i + 1}`,
      stakeWeight: 1.0,
      status: "active",
      slashed: false,
      slashedAt: null,
      slashReason: null,
      totalSubmissions: 0,
      totalSlashes: 0,
    }));
  };

  it("computes consensus when 3f+1 honest nodes report (N=4, f=1, Quorum=3)", async () => {
    const nodes = generateNodes(4);
    const reports: OracleReport[] = [
      { providerKey: "oracle_node_1", price: 100.0, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_2", price: 100.2, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_3", price: 99.8, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_4", price: 100.1, timestamp: new Date().toISOString() },
    ];

    const result = await service.aggregateBftState("USDC", reports, nodes);

    expect(result.quorumReached).toBe(true);
    expect(result.validProviders).toBe(4);
    expect(result.requiredQuorum).toBe(3);
    expect(result.consensusPrice).toBeCloseTo(100.025, 2);
    expect(result.slashedProviders).toHaveLength(0);
    expect(service.verifyAggregatePayload(result)).toBe(true);
  });

  it("detects and slashes > 5 sigma Byzantine outlier node", async () => {
    const nodes = generateNodes(4);
    const reports: OracleReport[] = [
      { providerKey: "oracle_node_1", price: 100.0, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_2", price: 100.1, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_3", price: 99.9, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_4", price: 500.0, timestamp: new Date().toISOString() }, // Malicious outlier (> 5 sigma)
    ];

    const result = await service.aggregateBftState("USDC", reports, nodes);

    expect(result.quorumReached).toBe(true);
    expect(result.slashedProviders).toContain("oracle_node_4");
    expect(result.validProviders).toBe(3);
    expect(result.consensusPrice).toBeCloseTo(100.0, 1);
  });

  it("fails quorum when reporting node count is below 2f+1 threshold (network partition)", async () => {
    const nodes = generateNodes(4); // N=4, f=1, Quorum=3
    const reports: OracleReport[] = [
      { providerKey: "oracle_node_1", price: 100.0, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_2", price: 100.1, timestamp: new Date().toISOString() },
    ]; // Only 2 reports submitted

    const result = await service.aggregateBftState("USDC", reports, nodes);

    expect(result.quorumReached).toBe(false);
    expect(result.reportingProviders).toBe(2);
    expect(result.requiredQuorum).toBe(3);
    expect(result.consensusPrice).toBe(0);
  });

  it("ignores reports from already slashed or suspended oracle nodes", async () => {
    const nodes = generateNodes(4);
    nodes[3].slashed = true;
    nodes[3].status = "slashed";

    const reports: OracleReport[] = [
      { providerKey: "oracle_node_1", price: 100.0, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_2", price: 100.1, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_3", price: 99.9, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_4", price: 999.9, timestamp: new Date().toISOString() },
    ];

    const result = await service.aggregateBftState("USDC", reports, nodes);

    expect(result.quorumReached).toBe(true);
    expect(result.reportingProviders).toBe(3);
    expect(result.validProviders).toBe(3);
    expect(result.slashedProviders).not.toContain("oracle_node_4");
  });

  it("correctly weights stake median for consensus calculation", async () => {
    const nodes = generateNodes(3);
    nodes[0].stakeWeight = 10.0; // High stake
    nodes[1].stakeWeight = 1.0;
    nodes[2].stakeWeight = 1.0;

    const reports: OracleReport[] = [
      { providerKey: "oracle_node_1", price: 105.0, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_2", price: 100.0, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_3", price: 98.0, timestamp: new Date().toISOString() },
    ];

    const result = await service.aggregateBftState("ETH", reports, nodes);

    expect(result.weightedMedianPrice).toBe(105.0);
    expect(result.consensusPrice).toBeGreaterThan(100.0);
  });

  it("deduplicates duplicate report submissions from the same provider key", async () => {
    const nodes = generateNodes(4);
    const reports: OracleReport[] = [
      { providerKey: "oracle_node_1", price: 100.0, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_1", price: 100.0, timestamp: new Date().toISOString() },
      { providerKey: "oracle_node_1", price: 100.0, timestamp: new Date().toISOString() },
    ];

    const result = await service.aggregateBftState("USDC", reports, nodes);

    expect(result.quorumReached).toBe(false);
    expect(result.reportingProviders).toBe(1);
  });
});

