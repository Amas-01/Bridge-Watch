import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { rpcEvidenceQuorumRoutes } from "../rpcEvidenceQuorum.routes.js";
import { rpcEvidenceQuorumService } from "../../../services/rpcEvidenceQuorum.service.js";

vi.mock("../../../services/rpcEvidenceQuorum.service.js", () => {
  const mockResult = {
    accepted: true,
    decision: "ACCEPTED",
    confidenceScore: 1.0,
    isDegraded: false,
    hasDisagreement: false,
    hasExcessiveLag: false,
    totalProviders: 2,
    independentGroupsCount: 2,
    agreedGroupsCount: 2,
    headerAnchor: {
      canonicalBlockNumber: 100,
      canonicalBlockHash: "0x123",
      consensusTimestamp: 1700000000,
    },
    agreedData: { supply: 5000 },
    disagreementDetails: {
      disagreeingProviders: [],
      laggingProviders: [],
      correlatedGroups: {},
    },
    failClosed: false,
  };

  return {
    rpcEvidenceQuorumService: {
      evaluateQuorum: vi.fn().mockResolvedValue(mockResult),
      getConfig: vi.fn().mockResolvedValue({
        minQuorumSize: 2,
        quorumThresholdRatio: 0.67,
        maxLagBlocks: 5,
        failClosed: false,
      }),
      setConfig: vi.fn().mockImplementation(async (cfg) => cfg),
      getEvidenceLogs: vi.fn().mockResolvedValue([mockResult]),
      registerProviderGroup: vi.fn().mockImplementation(async (url, group) => ({ endpointUrl: url, providerGroup: group })),
    },
  };
});

vi.mock("../../middleware/auth.js", () => ({
  authMiddleware: () => async () => {},
}));

describe("rpcEvidenceQuorumRoutes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await app.register(rpcEvidenceQuorumRoutes);
    vi.clearAllMocks();
  });

  it("POST /verify evaluates quorum evidence", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/verify",
      payload: {
        chainId: "ethereum-mainnet",
        operationType: "reserve_read",
        readIdentifier: "usdc-vault",
        responses: [
          { endpoint: "https://infura.io", blockNumber: 100, blockHash: "0x123", data: { supply: 5000 } },
          { endpoint: "https://alchemy.com", blockNumber: 100, blockHash: "0x123", data: { supply: 5000 } },
        ],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.accepted).toBe(true);
    expect(body.decision).toBe("ACCEPTED");
    expect(body.confidenceScore).toBe(1.0);
  });

  it("GET /configs returns quorum threshold configuration", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/configs?chainId=ethereum-mainnet&operationType=reserve_read",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.minQuorumSize).toBe(2);
    expect(body.quorumThresholdRatio).toBe(0.67);
  });

  it("POST /configs updates quorum threshold configuration", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/configs",
      payload: {
        chainId: "ethereum-mainnet",
        operationType: "reserve_read",
        minQuorumSize: 3,
        failClosed: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(rpcEvidenceQuorumService.setConfig).toHaveBeenCalled();
  });

  it("GET /logs returns evidence evaluation history", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/logs?chainId=ethereum-mainnet&limit=10",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.logs).toHaveLength(1);
    expect(body.count).toBe(1);
  });

  it("POST /provider-groups registers endpoint provider group", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/provider-groups",
      payload: {
        endpointUrl: "https://node.datacenter1.com",
        providerGroup: "datacenter-1",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(rpcEvidenceQuorumService.registerProviderGroup).toHaveBeenCalledWith(
      "https://node.datacenter1.com",
      "datacenter-1",
      undefined
    );
  });
});
