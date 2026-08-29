import { describe, it, expect, vi, beforeEach } from "vitest";
import { WormholeBridgeWatcher } from "../../../src/services/ethereum/wormholeWatcher.service.js";

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const mockGetBridgeReserves = vi.fn();
const mockGetSupportedChains = vi.fn();

vi.mock("../../../src/services/ethereum/client.js", () => ({
  getEthereumRpcClient: () => ({
    getBridgeReserves: mockGetBridgeReserves,
    getSupportedChains: mockGetSupportedChains,
  }),
}));

const LOCK_CONTRACT_ROWS = [
  {
    id: "1",
    bridge_name: "Wormhole Bridge",
    chain_id: "ethereum",
    contract_address: "0xEthBridge",
    token_address: "0xEthToken",
    asset_symbol: "wETH",
    is_active: true,
  },
  {
    id: "2",
    bridge_name: "Wormhole Bridge",
    chain_id: "polygon",
    contract_address: "0xPolyBridge",
    token_address: "0xPolyToken",
    asset_symbol: "wETH",
    is_active: true,
  },
];

function buildMockDb(rows: typeof LOCK_CONTRACT_ROWS) {
  const query: any = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => void) => resolve(rows),
  };
  return vi.fn().mockReturnValue(query);
}

vi.mock("../../../src/database/connection.js", () => ({
  getDatabase: () => mockDb,
}));

let mockDb: ReturnType<typeof buildMockDb>;

describe("WormholeBridgeWatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = buildMockDb(LOCK_CONTRACT_ROWS);
    mockGetSupportedChains.mockReturnValue(["ethereum", "polygon", "base"]);
  });

  describe("fetchLockBalances", () => {
    it("fetches reserves for each registered chain", async () => {
      mockGetBridgeReserves.mockImplementation(async (chain: string) => ({
        chain,
        contractAddress: chain === "ethereum" ? "0xEthBridge" : "0xPolyBridge",
        tokenAddress: chain === "ethereum" ? "0xEthToken" : "0xPolyToken",
        lockedAmount: 1000n,
        formattedAmount: chain === "ethereum" ? "600" : "400",
        isPaused: false,
        blockNumber: 100,
        timestamp: 1700000000,
      }));

      const watcher = new WormholeBridgeWatcher();
      const details = await watcher.fetchLockBalances({ bridgeName: "Wormhole Bridge" });

      expect(details).toHaveLength(2);
      expect(details[0]).toMatchObject({ chain: "ethereum", lockedAmount: "600", error: null });
      expect(details[1]).toMatchObject({ chain: "polygon", lockedAmount: "400", error: null });
    });

    it("marks a chain unavailable without an RPC client configured", async () => {
      mockGetSupportedChains.mockReturnValue(["polygon"]);
      mockGetBridgeReserves.mockResolvedValue({
        chain: "polygon",
        contractAddress: "0xPolyBridge",
        tokenAddress: "0xPolyToken",
        lockedAmount: 400n,
        formattedAmount: "400",
        isPaused: false,
        blockNumber: 100,
        timestamp: 1700000000,
      });

      const watcher = new WormholeBridgeWatcher();
      const details = await watcher.fetchLockBalances({ bridgeName: "Wormhole Bridge" });

      const ethDetail = details.find((d) => d.chain === "ethereum");
      expect(ethDetail?.error).toContain("not configured");
      expect(ethDetail?.lockedAmount).toBe("0");
    });

    it("isolates a per-chain RPC failure without failing the others", async () => {
      mockGetBridgeReserves.mockImplementation(async (chain: string) => {
        if (chain === "ethereum") throw new Error("RPC timeout");
        return {
          chain,
          contractAddress: "0xPolyBridge",
          tokenAddress: "0xPolyToken",
          lockedAmount: 400n,
          formattedAmount: "400",
          isPaused: false,
          blockNumber: 100,
          timestamp: 1700000000,
        };
      });

      const watcher = new WormholeBridgeWatcher();
      const details = await watcher.fetchLockBalances({ bridgeName: "Wormhole Bridge" });

      const ethDetail = details.find((d) => d.chain === "ethereum");
      const polyDetail = details.find((d) => d.chain === "polygon");
      expect(ethDetail?.error).toContain("RPC timeout");
      expect(polyDetail?.error).toBeNull();
      expect(polyDetail?.lockedAmount).toBe("400");
    });

    it("returns an empty array when no contracts are registered", async () => {
      mockDb = buildMockDb([]);
      const watcher = new WormholeBridgeWatcher();
      const details = await watcher.fetchLockBalances({ bridgeName: "Unknown Bridge" });
      expect(details).toEqual([]);
    });
  });

  describe("getTotalLocked", () => {
    it("sums locked amounts across chains, excluding failed lookups", async () => {
      mockGetBridgeReserves.mockImplementation(async (chain: string) => {
        if (chain === "ethereum") throw new Error("RPC timeout");
        return {
          chain,
          contractAddress: "0xPolyBridge",
          tokenAddress: "0xPolyToken",
          lockedAmount: 400n,
          formattedAmount: "400",
          isPaused: false,
          blockNumber: 100,
          timestamp: 1700000000,
        };
      });

      const watcher = new WormholeBridgeWatcher();
      const total = await watcher.getTotalLocked("wETH");
      expect(total).toBe(400);
    });
  });
});
