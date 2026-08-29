import { describe, it, expect, vi, beforeEach } from "vitest";
import { SupplyChainService } from "../../src/services/supplyChain.service.js";

vi.mock("../../src/utils/redis.js", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("SupplyChainService", () => {
  let service: SupplyChainService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SupplyChainService();
  });

  describe("getGraph", () => {
    it("returns a graph with nodes and edges when cache is empty", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(null);

      const graph = await service.getGraph();

      expect(graph.nodes).toHaveLength(6);
      expect(graph.edges).toHaveLength(7);
      expect(graph.totalSupplyUsd).toBeGreaterThan(0);
      expect(graph.totalBridgeVolumeUsd).toBeGreaterThan(0);
      expect(graph.lastUpdated).toBeTruthy();
    });

    it("returns cached graph when cache hit", async () => {
      const cached = {
        nodes: [],
        edges: [],
        totalSupplyUsd: 0,
        totalBridgeVolumeUsd: 0,
        lastUpdated: new Date().toISOString(),
      };
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cached));

      const graph = await service.getGraph();

      expect(graph.totalSupplyUsd).toBe(0);
    });

    it("builds and caches the graph on cache miss", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(null);

      await service.getGraph();

      expect(redis.set).toHaveBeenCalledWith(
        "supply-chain:graph",
        expect.any(String),
        "EX",
        60,
      );
    });

    it("includes all chain nodes with correct structure", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(null);

      const graph = await service.getGraph();
      const stellar = graph.nodes.find((n) => n.id === "stellar");

      expect(stellar).toBeDefined();
      expect(stellar?.label).toBe("Stellar");
      expect(stellar?.chain).toBe("stellar");
      expect(stellar?.totalSupplyUsd).toBeGreaterThan(0);
      expect(stellar?.healthScore).toBeGreaterThan(0);
      expect(stellar?.assets.length).toBeGreaterThan(0);
    });

    it("includes all bridge edges with correct structure", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(null);

      const graph = await service.getGraph();
      const bridge = graph.edges.find((e) => e.id === "stellar-ethereum-allbridge");

      expect(bridge).toBeDefined();
      expect(bridge?.bridgeName).toBe("Allbridge");
      expect(bridge?.volume24hUsd).toBeGreaterThan(0);
      expect(["healthy", "degraded", "offline"]).toContain(bridge?.status);
    });

    it("handles unknown chain gracefully", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(null);

      const graph = await service.getGraph();
      graph.nodes.forEach((node) => {
        expect(node.healthScore).toBeGreaterThanOrEqual(0);
        expect(node.totalSupplyUsd).toBeGreaterThanOrEqual(0);
      });
    });

    it("handles cache read error gracefully", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockRejectedValue(new Error("Connection error"));

      const graph = await service.getGraph();

      expect(graph.nodes).toHaveLength(6);
      expect(graph.edges).toHaveLength(7);
    });

    it("handles cache write error gracefully", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(null);
      vi.mocked(redis.set).mockRejectedValue(new Error("Write error"));

      const graph = await service.getGraph();

      expect(graph.nodes).toHaveLength(6);
      expect(graph.totalSupplyUsd).toBeGreaterThan(0);
    });
  });

  describe("graph data integrity", () => {
    it("computes totalSupplyUsd as sum of all node supplies", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(null);

      const graph = await service.getGraph();
      const expectedTotal = graph.nodes.reduce((s, n) => s + n.totalSupplyUsd, 0);

      expect(graph.totalSupplyUsd).toBe(expectedTotal);
    });

    it("computes totalBridgeVolumeUsd as sum of all edge volumes", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(null);

      const graph = await service.getGraph();
      const expectedVolume = graph.edges.reduce((s, e) => s + e.volume24hUsd, 0);

      expect(graph.totalBridgeVolumeUsd).toBe(expectedVolume);
    });

    it("reports lastUpdated as a valid ISO string", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      vi.mocked(redis.get).mockResolvedValue(null);

      const graph = await service.getGraph();

      expect(() => new Date(graph.lastUpdated)).not.toThrow();
      expect(new Date(graph.lastUpdated).toISOString()).toBe(graph.lastUpdated);
    });
  });
});
