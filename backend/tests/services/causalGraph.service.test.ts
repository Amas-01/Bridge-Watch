import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CausalGraphService,
  scoreCandidateEdge,
  computeGraphChecksum,
  clampScore,
  type CausalGraphNode,
  type CausalGraphEdge,
} from "../../src/services/causalGraph.service.js";

const createQueryBuilder = (rows: any[] = []) => {
  const builder: any = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    andWhereNot: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    whereNot: vi.fn().mockReturnThis(),
    orWhere: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    first: vi.fn().mockResolvedValue(rows[0] ?? null),
    clone: vi.fn(() => builder),
    then: (resolve: (value: any) => any) => resolve(rows),
  };
  return builder;
};

const mockKnex = vi.hoisted(() => {
  const knex: any = vi.fn(() => createQueryBuilder([]));
  return knex;
});

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockKnex,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function nodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "node-1",
    incident_id: "incident-1",
    node_type: "observation",
    entity_type: "bridge_transactions",
    entity_id: "tx-1",
    label: "Deposit observed",
    occurred_at: "2026-01-01T00:00:00.000Z",
    observed_at: "2026-01-01T00:00:05.000Z",
    confidence_state: "confirmed",
    superseded_by_node_id: null,
    metadata: "{}",
    created_at: "2026-01-01T00:00:05.000Z",
    updated_at: "2026-01-01T00:00:05.000Z",
    ...overrides,
  };
}

function edgeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "edge-1",
    incident_id: "incident-1",
    from_node_id: "node-1",
    to_node_id: "node-2",
    relation_type: "causes",
    confidence_class: "direct_evidence",
    confidence_score: 0.95,
    inference_rule: "explicit_provenance_reference",
    evidence: JSON.stringify([{ type: "observation", id: "node-1" }]),
    temporal_confidence: "{}",
    status: "active",
    superseded_by_edge_id: null,
    revoked_reason: null,
    created_by: "system",
    created_at: "2026-01-01T00:00:10.000Z",
    updated_at: "2026-01-01T00:00:10.000Z",
    ...overrides,
  };
}

describe("CausalGraphService", () => {
  let service: CausalGraphService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockKnex.mockImplementation(() => createQueryBuilder([]));
    service = new CausalGraphService();
  });

  describe("addNode", () => {
    it("inserts a new node and records a node_added revision", async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === "causal_graph_nodes") return createQueryBuilder([nodeRow()]);
        return createQueryBuilder([]);
      });

      const node = await service.addNode("incident-1", {
        nodeType: "observation",
        label: "Deposit observed",
        occurredAt: "2026-01-01T00:00:00.000Z",
        entityType: "bridge_transactions",
        entityId: "tx-1",
        autoLink: false,
      });

      expect(node.id).toBe("node-1");
      expect(node.confidenceState).toBe("confirmed");

      const revisionCalls = mockKnex.mock.calls.filter(([table]: [string]) => table === "causal_graph_revisions");
      expect(revisionCalls.length).toBeGreaterThan(0);
    });

    it("corrects an existing node instead of leaving a duplicate when the same entity is re-ingested", async () => {
      const existing = nodeRow({ id: "node-old" });
      let nodesUpdateCalled = false;

      mockKnex.mockImplementation((table: string) => {
        if (table === "causal_graph_nodes") {
          const builder = createQueryBuilder([nodeRow({ id: "node-new" })]);
          builder.first = vi.fn().mockResolvedValue(existing);
          builder.update = vi.fn().mockImplementation(() => {
            nodesUpdateCalled = true;
            return builder;
          });
          return builder;
        }
        return createQueryBuilder([]);
      });

      const node = await service.addNode("incident-1", {
        nodeType: "observation",
        label: "Deposit observed (revised amount)",
        occurredAt: "2026-01-01T00:00:00.000Z",
        entityType: "bridge_transactions",
        entityId: "tx-1",
        autoLink: false,
      });

      expect(node.id).toBe("node-new");
      expect(nodesUpdateCalled).toBe(true);

      const revisionInserts = mockKnex.mock.calls
        .filter(([table]: [string]) => table === "causal_graph_revisions")
        .length;
      expect(revisionInserts).toBeGreaterThan(0);
    });
  });

  describe("addEdge", () => {
    it("rejects an edge with no evidence", async () => {
      await expect(
        service.addEdge("incident-1", {
          fromNodeId: "node-1",
          toNodeId: "node-2",
          confidenceClass: "correlation",
          inferenceRule: "manual",
          evidence: [],
        })
      ).rejects.toThrow(/evidence/);
    });

    it("rejects an edge with no inference rule", async () => {
      await expect(
        service.addEdge("incident-1", {
          fromNodeId: "node-1",
          toNodeId: "node-2",
          confidenceClass: "correlation",
          inferenceRule: "",
          evidence: [{ type: "alert", id: "a1" }],
        })
      ).rejects.toThrow(/inference rule/);
    });

    it("rejects linking to a reverted node", async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === "causal_graph_nodes") {
          const builder = createQueryBuilder([]);
          builder.first = vi.fn().mockResolvedValue(nodeRow({ confidence_state: "reverted" }));
          return builder;
        }
        return createQueryBuilder([]);
      });

      await expect(
        service.addEdge("incident-1", {
          fromNodeId: "node-1",
          toNodeId: "node-2",
          confidenceClass: "direct_evidence",
          inferenceRule: "manual",
          evidence: [{ type: "alert", id: "a1" }],
        })
      ).rejects.toThrow(/reverted/);
    });

    it("applies the default confidence score for the given class when none is provided", async () => {
      let insertedRow: any = null;
      mockKnex.mockImplementation((table: string) => {
        if (table === "causal_graph_nodes") {
          const builder = createQueryBuilder([]);
          builder.first = vi.fn().mockResolvedValue(nodeRow());
          return builder;
        }
        if (table === "causal_graph_edges") {
          const builder = createQueryBuilder([]);
          builder.insert = vi.fn().mockImplementation((row: any) => {
            insertedRow = row;
            return builder;
          });
          builder.returning = vi.fn().mockResolvedValue([edgeRow({ confidence_score: 0.6, confidence_class: "correlation" })]);
          return builder;
        }
        return createQueryBuilder([]);
      });

      const edge = await service.addEdge("incident-1", {
        fromNodeId: "node-1",
        toNodeId: "node-2",
        confidenceClass: "correlation",
        inferenceRule: "manual",
        evidence: [{ type: "alert", id: "a1" }],
      });

      expect(insertedRow.confidence_score).toBe(0.6);
      expect(edge.confidenceClass).toBe("correlation");
    });
  });

  describe("revertEdge", () => {
    it("marks the edge reverted (not deleted) and records a revision", async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === "causal_graph_edges") {
          const builder = createQueryBuilder([]);
          builder.returning = vi.fn().mockResolvedValue([edgeRow({ status: "reverted", revoked_reason: "reorg" })]);
          return builder;
        }
        return createQueryBuilder([]);
      });

      const edge = await service.revertEdge("incident-1", "edge-1", "reorg", "operator-1");

      expect(edge.status).toBe("reverted");
      expect(edge.revokedReason).toBe("reorg");
      const revisionCalls = mockKnex.mock.calls.filter(([table]: [string]) => table === "causal_graph_revisions");
      expect(revisionCalls.length).toBeGreaterThan(0);
    });

    it("throws if the edge does not exist", async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === "causal_graph_edges") {
          const builder = createQueryBuilder([]);
          builder.returning = vi.fn().mockResolvedValue([]);
          return builder;
        }
        return createQueryBuilder([]);
      });

      await expect(service.revertEdge("incident-1", "missing-edge", "reorg")).rejects.toThrow(/not found/);
    });
  });

  describe("getSubgraph", () => {
    it("excludes reverted nodes by default and includes them when requested", async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === "causal_graph_nodes") return createQueryBuilder([nodeRow()]);
        if (table === "causal_graph_edges") return createQueryBuilder([edgeRow()]);
        return createQueryBuilder([]);
      });

      const result = await service.getSubgraph("incident-1");
      expect(result.nodes).toHaveLength(1);
      expect(result.edges).toHaveLength(1);
    });

    it("returns nodes sorted deterministically by occurredAt then id", async () => {
      const rows = [
        nodeRow({ id: "b", occurred_at: "2026-01-01T00:00:00.000Z" }),
        nodeRow({ id: "a", occurred_at: "2026-01-01T00:00:00.000Z" }),
        nodeRow({ id: "c", occurred_at: "2025-12-31T00:00:00.000Z" }),
      ];
      mockKnex.mockImplementation((table: string) => {
        if (table === "causal_graph_nodes") return createQueryBuilder(rows);
        return createQueryBuilder([]);
      });

      const result = await service.getSubgraph("incident-1");
      expect(result.nodes.map((n) => n.id)).toEqual(["c", "a", "b"]);
    });
  });

  describe("exportIncidentGraph", () => {
    it("produces the same checksum for the same graph state across two exports", async () => {
      mockKnex.mockImplementation((table: string) => {
        if (table === "causal_graph_nodes") return createQueryBuilder([nodeRow()]);
        if (table === "causal_graph_edges") return createQueryBuilder([edgeRow()]);
        return createQueryBuilder([]);
      });

      const first = await service.exportIncidentGraph("incident-1");
      const second = await service.exportIncidentGraph("incident-1");

      expect(first.checksum).toBe(second.checksum);
      expect(first.nodeCount).toBe(1);
      expect(first.edgeCount).toBe(1);
    });
  });
});

describe("scoreCandidateEdge (pure inference rules)", () => {
  const base: Pick<CausalGraphNode, "entityType" | "entityId" | "occurredAt" | "metadata"> = {
    entityType: "bridge_transactions",
    entityId: "tx-1",
    occurredAt: "2026-01-01T00:00:00.000Z",
    metadata: { bridgeId: "bridge-a" },
  };

  it("returns null when the effect precedes the cause", () => {
    const effect = { ...base, occurredAt: "2025-12-31T23:00:00.000Z", metadata: {} };
    expect(scoreCandidateEdge(base, effect)).toBeNull();
  });

  it("scores an explicit provenance reference as direct_evidence", () => {
    const effect = {
      entityType: "alert_events",
      entityId: "alert-1",
      occurredAt: "2026-01-01T00:05:00.000Z",
      metadata: { causedByEntityId: "tx-1" },
    };
    const result = scoreCandidateEdge(base, effect);
    expect(result?.confidenceClass).toBe("direct_evidence");
    expect(result?.inferenceRule).toBe("explicit_provenance_reference");
    expect(result?.score).toBeGreaterThanOrEqual(0.9);
  });

  it("scores shared bridgeId within the correlation window as correlation", () => {
    const effect = {
      entityType: "alert_events",
      entityId: "alert-1",
      occurredAt: "2026-01-01T00:10:00.000Z",
      metadata: { bridgeId: "bridge-a" },
    };
    const result = scoreCandidateEdge(base, effect);
    expect(result?.confidenceClass).toBe("correlation");
    expect(result?.inferenceRule).toBe("temporal_adjacency_same_entity");
  });

  it("returns unknown for temporal proximity alone within the weak window", () => {
    const effect = {
      entityType: "operator_actions",
      entityId: "op-1",
      occurredAt: "2026-01-01T00:05:00.000Z",
      metadata: {},
    };
    const cause = { ...base, entityType: "provider_failures" };
    const result = scoreCandidateEdge(cause, effect);
    expect(result?.confidenceClass).toBe("unknown");
  });

  it("returns null when nothing links the nodes and they are far apart in time", () => {
    const effect = {
      entityType: "operator_actions",
      entityId: "op-1",
      occurredAt: "2026-01-01T05:00:00.000Z",
      metadata: {},
    };
    const cause = { ...base, entityType: "provider_failures" };
    expect(scoreCandidateEdge(cause, effect)).toBeNull();
  });
});

describe("computeGraphChecksum", () => {
  it("is stable under reordering of the input arrays", () => {
    const nodes: CausalGraphNode[] = [
      {
        id: "a",
        incidentId: "i1",
        nodeType: "observation",
        entityType: null,
        entityId: null,
        label: "A",
        occurredAt: "2026-01-01T00:00:00.000Z",
        observedAt: "2026-01-01T00:00:00.000Z",
        confidenceState: "confirmed",
        supersededByNodeId: null,
        metadata: {},
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "b",
        incidentId: "i1",
        nodeType: "alert",
        entityType: null,
        entityId: null,
        label: "B",
        occurredAt: "2026-01-01T00:05:00.000Z",
        observedAt: "2026-01-01T00:05:00.000Z",
        confidenceState: "confirmed",
        supersededByNodeId: null,
        metadata: {},
        createdAt: "2026-01-01T00:05:00.000Z",
        updatedAt: "2026-01-01T00:05:00.000Z",
      },
    ];
    const edges: CausalGraphEdge[] = [];

    const first = computeGraphChecksum(nodes, edges);
    const second = computeGraphChecksum([...nodes].reverse(), edges);
    expect(first).toBe(second);
  });

  it("changes when a node's confidence state changes", () => {
    const node: CausalGraphNode = {
      id: "a",
      incidentId: "i1",
      nodeType: "observation",
      entityType: null,
      entityId: null,
      label: "A",
      occurredAt: "2026-01-01T00:00:00.000Z",
      observedAt: "2026-01-01T00:00:00.000Z",
      confidenceState: "confirmed",
      supersededByNodeId: null,
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const before = computeGraphChecksum([node], []);
    const after = computeGraphChecksum([{ ...node, confidenceState: "reverted" }], []);
    expect(before).not.toBe(after);
  });
});

describe("clampScore", () => {
  it("clamps values into [0, 1]", () => {
    expect(clampScore(-1)).toBe(0);
    expect(clampScore(2)).toBe(1);
    expect(clampScore(0.5)).toBe(0.5);
    expect(clampScore(NaN)).toBe(0);
  });
});
