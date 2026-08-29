import crypto from "node:crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type CausalNodeType =
  | "observation"
  | "derived_metric"
  | "alert"
  | "operator_action"
  | "contract_event"
  | "provider_failure";

export type CausalConfidenceClass = "direct_evidence" | "correlation" | "unknown";
export type CausalNodeState = "confirmed" | "corrected" | "reverted";
export type CausalEdgeStatus = "active" | "reverted" | "superseded";
export type CausalRelationType = "causes" | "contributes_to" | "correlates_with" | "precedes";

const DEFAULT_CONFIDENCE_BY_CLASS: Record<CausalConfidenceClass, number> = {
  direct_evidence: 0.95,
  correlation: 0.6,
  unknown: 0.3,
};

// Bounds the auto-inference pass so a single node ingestion cannot degrade
// into an O(n^2) scan on high-volume incidents.
const AUTO_LINK_CANDIDATE_LIMIT = 200;
const AUTO_LINK_MAX_EDGES_PER_NODE = 5;
const AUTO_LINK_CORRELATION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const AUTO_LINK_WEAK_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const AUTO_LINK_MIN_SCORE = 0.2;

export interface CausalEvidenceRef {
  type: string;
  id: string;
  description?: string;
}

export interface CausalTemporalConfidence {
  earliestAt?: string;
  latestAt?: string;
  windowSeconds?: number;
}

export interface CausalGraphNode {
  id: string;
  incidentId: string;
  nodeType: CausalNodeType;
  entityType: string | null;
  entityId: string | null;
  label: string;
  occurredAt: string;
  observedAt: string;
  confidenceState: CausalNodeState;
  supersededByNodeId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CausalGraphEdge {
  id: string;
  incidentId: string;
  fromNodeId: string;
  toNodeId: string;
  relationType: CausalRelationType;
  confidenceClass: CausalConfidenceClass;
  confidenceScore: number;
  inferenceRule: string;
  evidence: CausalEvidenceRef[];
  temporalConfidence: CausalTemporalConfidence;
  status: CausalEdgeStatus;
  supersededByEdgeId: string | null;
  revokedReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddNodeInput {
  nodeType: CausalNodeType;
  label: string;
  occurredAt: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  actor?: string;
  /** When false, skips the automatic edge-inference pass for this node. */
  autoLink?: boolean;
}

export interface AddEdgeInput {
  fromNodeId: string;
  toNodeId: string;
  confidenceClass: CausalConfidenceClass;
  inferenceRule: string;
  evidence: CausalEvidenceRef[];
  relationType?: CausalRelationType;
  confidenceScore?: number;
  temporalConfidence?: CausalTemporalConfidence;
  actor?: string;
}

export interface SubgraphOptions {
  includeReverted?: boolean;
  nodeTypes?: CausalNodeType[];
  since?: string;
  limit?: number;
}

const DEFAULT_SUBGRAPH_LIMIT = 2000;

function toNode(row: any): CausalGraphNode {
  return {
    id: row.id,
    incidentId: row.incident_id,
    nodeType: row.node_type,
    entityType: row.entity_type ?? null,
    entityId: row.entity_id ?? null,
    label: row.label,
    occurredAt: new Date(row.occurred_at).toISOString(),
    observedAt: new Date(row.observed_at).toISOString(),
    confidenceState: row.confidence_state,
    supersededByNodeId: row.superseded_by_node_id ?? null,
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata ?? {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

function toEdge(row: any): CausalGraphEdge {
  return {
    id: row.id,
    incidentId: row.incident_id,
    fromNodeId: row.from_node_id,
    toNodeId: row.to_node_id,
    relationType: row.relation_type,
    confidenceClass: row.confidence_class,
    confidenceScore: Number(row.confidence_score),
    inferenceRule: row.inference_rule,
    evidence: typeof row.evidence === "string" ? JSON.parse(row.evidence) : row.evidence ?? [],
    temporalConfidence:
      typeof row.temporal_confidence === "string" ? JSON.parse(row.temporal_confidence) : row.temporal_confidence ?? {},
    status: row.status,
    supersededByEdgeId: row.superseded_by_edge_id ?? null,
    revokedReason: row.revoked_reason ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
  };
}

/** Clamp a confidence score into [0, 1]. */
export function clampScore(score: number): number {
  if (Number.isNaN(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

/**
 * Score a candidate causal edge between an earlier node ("cause") and a
 * newly observed node ("effect"). Pure function so the inference rules can
 * be unit tested without a database.
 */
export function scoreCandidateEdge(
  cause: Pick<CausalGraphNode, "entityType" | "entityId" | "occurredAt" | "metadata">,
  effect: Pick<CausalGraphNode, "entityType" | "entityId" | "occurredAt" | "metadata">
): { confidenceClass: CausalConfidenceClass; score: number; inferenceRule: string; reasons: string[] } | null {
  const causeAt = new Date(cause.occurredAt).getTime();
  const effectAt = new Date(effect.occurredAt).getTime();
  if (Number.isNaN(causeAt) || Number.isNaN(effectAt)) return null;
  const delta = effectAt - causeAt;
  if (delta < 0) return null; // an effect cannot precede its cause

  const reasons: string[] = [];

  // Rule A: the effect's metadata explicitly references the cause's entity —
  // the strongest possible signal, e.g. an alert whose payload names the
  // triggering observation id.
  const referencedIds: string[] = Array.isArray((effect.metadata as any)?.relatedEntityIds)
    ? ((effect.metadata as any).relatedEntityIds as unknown[]).map(String)
    : [];
  const causedByEntityId = (effect.metadata as any)?.causedByEntityId;
  if (
    cause.entityId &&
    (referencedIds.includes(cause.entityId) || causedByEntityId === cause.entityId)
  ) {
    reasons.push("explicit_provenance_reference");
    return { confidenceClass: "direct_evidence", score: 0.95, inferenceRule: "explicit_provenance_reference", reasons };
  }

  // Rule B: same logical entity (bridge/asset/provider) referenced in both
  // nodes' metadata and close in time => correlation.
  const sharedEntity =
    (cause.metadata as any)?.bridgeId && (cause.metadata as any).bridgeId === (effect.metadata as any)?.bridgeId
      ? "bridgeId"
      : (cause.metadata as any)?.assetCode && (cause.metadata as any).assetCode === (effect.metadata as any)?.assetCode
        ? "assetCode"
        : cause.entityType && cause.entityType === effect.entityType
          ? "entityType"
          : null;

  if (sharedEntity && delta <= AUTO_LINK_CORRELATION_WINDOW_MS) {
    const proximity = 1 - delta / AUTO_LINK_CORRELATION_WINDOW_MS;
    const score = clampScore(0.4 + proximity * 0.35);
    reasons.push(`shared_${sharedEntity}`, "temporal_adjacency");
    return { confidenceClass: "correlation", score, inferenceRule: "temporal_adjacency_same_entity", reasons };
  }

  // Rule C: weak fallback — close in time but no shared entity. Kept inside
  // a tight window so it stays bounded on high-volume incidents.
  if (delta <= AUTO_LINK_WEAK_WINDOW_MS) {
    const proximity = 1 - delta / AUTO_LINK_WEAK_WINDOW_MS;
    const score = clampScore(0.1 + proximity * 0.2);
    if (score < AUTO_LINK_MIN_SCORE) return null;
    reasons.push("temporal_precedence_only");
    return { confidenceClass: "unknown", score, inferenceRule: "temporal_precedence_only", reasons };
  }

  return null;
}

/** Deterministic ordering for reproducible subgraph exports. */
function sortNodes(nodes: CausalGraphNode[]): CausalGraphNode[] {
  return nodes
    .slice()
    .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() || a.id.localeCompare(b.id));
}

function sortEdges(edges: CausalGraphEdge[]): CausalGraphEdge[] {
  return edges
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id));
}

/** Stable checksum over a subgraph so repeated exports of the same state are byte-identical. */
export function computeGraphChecksum(nodes: CausalGraphNode[], edges: CausalGraphEdge[]): string {
  const canonical = JSON.stringify({
    nodes: sortNodes(nodes).map((n) => ({
      id: n.id,
      nodeType: n.nodeType,
      entityType: n.entityType,
      entityId: n.entityId,
      label: n.label,
      occurredAt: n.occurredAt,
      confidenceState: n.confidenceState,
    })),
    edges: sortEdges(edges).map((e) => ({
      id: e.id,
      fromNodeId: e.fromNodeId,
      toNodeId: e.toNodeId,
      relationType: e.relationType,
      confidenceClass: e.confidenceClass,
      confidenceScore: e.confidenceScore,
      inferenceRule: e.inferenceRule,
      status: e.status,
    })),
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export class CausalGraphService {
  private db = getDatabase();

  private async recordRevision(params: {
    incidentId: string;
    nodeId?: string | null;
    edgeId?: string | null;
    action: string;
    reason?: string | null;
    actor?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.db("causal_graph_revisions").insert({
        incident_id: params.incidentId,
        node_id: params.nodeId ?? null,
        edge_id: params.edgeId ?? null,
        action: params.action,
        reason: params.reason ?? null,
        actor: params.actor ?? "system",
        metadata: JSON.stringify(params.metadata ?? {}),
      });
    } catch (e) {
      logger.warn({ error: e, action: params.action }, "Failed to write causal graph revision");
    }
  }

  /**
   * Add (or, if this entity was already recorded, correct) a node. Corrections
   * never delete the prior row — they mark it "corrected" and insert a new
   * confirmed version linked via superseded_by_node_id — so late-arriving or
   * reorg-corrected evidence updates the graph without erasing prior
   * conclusions that were already drawn from it.
   */
  async addNode(incidentId: string, input: AddNodeInput): Promise<CausalGraphNode> {
    let existing: any = null;
    if (input.entityType && input.entityId) {
      existing = await this.db("causal_graph_nodes")
        .where({
          incident_id: incidentId,
          node_type: input.nodeType,
          entity_type: input.entityType,
          entity_id: input.entityId,
          confidence_state: "confirmed",
        })
        .first();
    }

    const [row] = await this.db("causal_graph_nodes")
      .insert({
        incident_id: incidentId,
        node_type: input.nodeType,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        label: input.label,
        occurred_at: input.occurredAt,
        observed_at: new Date().toISOString(),
        confidence_state: "confirmed",
        metadata: JSON.stringify(input.metadata ?? {}),
      })
      .returning("*");

    const node = toNode(row);

    if (existing) {
      await this.db("causal_graph_nodes").where({ id: existing.id }).update({
        confidence_state: "corrected",
        superseded_by_node_id: node.id,
        updated_at: new Date().toISOString(),
      });
      await this.recordRevision({
        incidentId,
        nodeId: node.id,
        action: "node_corrected",
        reason: "late_evidence",
        actor: input.actor,
        metadata: { previousNodeId: existing.id },
      });
    } else {
      await this.recordRevision({ incidentId, nodeId: node.id, action: "node_added", actor: input.actor });
    }

    if (input.autoLink !== false) {
      await this.inferEdgesForNode(incidentId, node, input.actor);
    }

    return node;
  }

  /**
   * Mark a node as invalidated (e.g. a reorg dropped the transaction it
   * represents) without deleting it, and demote any active edges touching it
   * to "reverted" for the same reason — preserving the full history for audit
   * while keeping the current view of the graph accurate.
   */
  async revertNode(incidentId: string, nodeId: string, reason: string, actor = "system"): Promise<CausalGraphNode> {
    const [row] = await this.db("causal_graph_nodes")
      .where({ id: nodeId, incident_id: incidentId })
      .update({ confidence_state: "reverted", updated_at: new Date().toISOString() })
      .returning("*");
    if (!row) throw new Error(`Causal graph node not found: ${nodeId}`);
    const node = toNode(row);

    await this.recordRevision({ incidentId, nodeId, action: "node_reverted", reason, actor });

    const affectedEdges = await this.db("causal_graph_edges")
      .where({ incident_id: incidentId, status: "active" })
      .andWhere((qb: any) => qb.where({ from_node_id: nodeId }).orWhere({ to_node_id: nodeId }));

    for (const edge of affectedEdges) {
      await this.revertEdge(incidentId, edge.id, reason, actor);
    }

    return node;
  }

  /**
   * Every edge must name the evidence and inference rule that produced it —
   * this is enforced here rather than left to callers.
   */
  async addEdge(incidentId: string, input: AddEdgeInput): Promise<CausalGraphEdge> {
    if (!input.evidence || input.evidence.length === 0) {
      throw new Error("Causal graph edges must name at least one evidence reference");
    }
    if (!input.inferenceRule) {
      throw new Error("Causal graph edges must name the inference rule that produced them");
    }

    const [fromNode, toNode_] = await Promise.all([
      this.db("causal_graph_nodes").where({ id: input.fromNodeId, incident_id: incidentId }).first(),
      this.db("causal_graph_nodes").where({ id: input.toNodeId, incident_id: incidentId }).first(),
    ]);
    if (!fromNode) throw new Error(`Causal graph node not found: ${input.fromNodeId}`);
    if (!toNode_) throw new Error(`Causal graph node not found: ${input.toNodeId}`);
    if (fromNode.confidence_state === "reverted" || toNode_.confidence_state === "reverted") {
      throw new Error("Cannot link a causal edge to a reverted node");
    }

    const confidenceScore = clampScore(input.confidenceScore ?? DEFAULT_CONFIDENCE_BY_CLASS[input.confidenceClass]);

    const [row] = await this.db("causal_graph_edges")
      .insert({
        incident_id: incidentId,
        from_node_id: input.fromNodeId,
        to_node_id: input.toNodeId,
        relation_type: input.relationType ?? "causes",
        confidence_class: input.confidenceClass,
        confidence_score: confidenceScore,
        inference_rule: input.inferenceRule,
        evidence: JSON.stringify(input.evidence),
        temporal_confidence: JSON.stringify(input.temporalConfidence ?? {}),
        status: "active",
        created_by: input.actor ?? "system",
      })
      .returning("*");

    const edge = toEdge(row);
    await this.recordRevision({ incidentId, edgeId: edge.id, action: "edge_added", actor: input.actor });
    return edge;
  }

  /** Marks an edge reverted without deleting it, preserving prior conclusions for audit. */
  async revertEdge(incidentId: string, edgeId: string, reason: string, actor = "system"): Promise<CausalGraphEdge> {
    const [row] = await this.db("causal_graph_edges")
      .where({ id: edgeId, incident_id: incidentId })
      .update({ status: "reverted", revoked_reason: reason, updated_at: new Date().toISOString() })
      .returning("*");
    if (!row) throw new Error(`Causal graph edge not found: ${edgeId}`);
    await this.recordRevision({ incidentId, edgeId, action: "edge_reverted", reason, actor });
    return toEdge(row);
  }

  /**
   * Replace an edge's conclusion with a corrected one (e.g. new evidence
   * changes an edge from "correlation" to "direct_evidence"). The old edge is
   * kept and marked superseded rather than deleted.
   */
  async supersedeEdge(
    incidentId: string,
    edgeId: string,
    replacement: AddEdgeInput,
    reason: string,
    actor = "system"
  ): Promise<{ previous: CausalGraphEdge; next: CausalGraphEdge }> {
    const existing = await this.db("causal_graph_edges").where({ id: edgeId, incident_id: incidentId }).first();
    if (!existing) throw new Error(`Causal graph edge not found: ${edgeId}`);

    const next = await this.addEdge(incidentId, replacement);

    const [updated] = await this.db("causal_graph_edges")
      .where({ id: edgeId })
      .update({ status: "superseded", superseded_by_edge_id: next.id, revoked_reason: reason, updated_at: new Date().toISOString() })
      .returning("*");

    await this.recordRevision({
      incidentId,
      edgeId,
      action: "edge_superseded",
      reason,
      actor,
      metadata: { supersededByEdgeId: next.id },
    });

    return { previous: toEdge(updated), next };
  }

  /**
   * Automatic inference pass run whenever a new node is added: proposes
   * causal edges from prior nodes in the same incident to the new node.
   * Bounded by a candidate-count limit and per-node edge cap so it stays
   * cheap even on high-volume incidents.
   */
  async inferEdgesForNode(incidentId: string, node: CausalGraphNode, actor = "system"): Promise<CausalGraphEdge[]> {
    const candidates = await this.db("causal_graph_nodes")
      .where({ incident_id: incidentId })
      .andWhere("confidence_state", "!=", "reverted")
      .andWhereNot("id", node.id)
      .andWhere("occurred_at", "<=", node.occurredAt)
      .orderBy("occurred_at", "desc")
      .limit(AUTO_LINK_CANDIDATE_LIMIT);

    const scored = candidates
      .map((row: any) => {
        const candidate = toNode(row);
        const result = scoreCandidateEdge(candidate, node);
        return result ? { candidate, ...result } : null;
      })
      .filter((x: any): x is NonNullable<typeof x> => x !== null)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, AUTO_LINK_MAX_EDGES_PER_NODE);

    const created: CausalGraphEdge[] = [];
    for (const s of scored) {
      const edge = await this.addEdge(incidentId, {
        fromNodeId: s.candidate.id,
        toNodeId: node.id,
        relationType: s.confidenceClass === "direct_evidence" ? "causes" : "correlates_with",
        confidenceClass: s.confidenceClass,
        confidenceScore: s.score,
        inferenceRule: s.inferenceRule,
        evidence: [
          { type: s.candidate.nodeType, id: s.candidate.id, description: s.candidate.label },
          { type: node.nodeType, id: node.id, description: node.label },
        ],
        temporalConfidence: {
          earliestAt: s.candidate.occurredAt,
          latestAt: node.occurredAt,
          windowSeconds: Math.round((new Date(node.occurredAt).getTime() - new Date(s.candidate.occurredAt).getTime()) / 1000),
        },
        actor,
      });
      created.push(edge);
    }
    return created;
  }

  /** Returns a deterministic, bounded subgraph for an incident. */
  async getSubgraph(incidentId: string, options: SubgraphOptions = {}): Promise<{ nodes: CausalGraphNode[]; edges: CausalGraphEdge[] }> {
    const limit = Math.min(options.limit ?? DEFAULT_SUBGRAPH_LIMIT, DEFAULT_SUBGRAPH_LIMIT);

    let nodeQuery = this.db("causal_graph_nodes").where({ incident_id: incidentId });
    if (!options.includeReverted) nodeQuery = nodeQuery.andWhere("confidence_state", "!=", "reverted");
    if (options.nodeTypes && options.nodeTypes.length > 0) nodeQuery = nodeQuery.whereIn("node_type", options.nodeTypes);
    if (options.since) nodeQuery = nodeQuery.andWhere("occurred_at", ">=", options.since);
    const nodeRows = await nodeQuery.orderBy("occurred_at", "asc").limit(limit);
    const nodes = sortNodes(nodeRows.map(toNode));

    let edgeQuery = this.db("causal_graph_edges").where({ incident_id: incidentId });
    if (!options.includeReverted) edgeQuery = edgeQuery.whereIn("status", ["active", "superseded"]);
    const edgeRows = await edgeQuery.orderBy("created_at", "asc").limit(limit);
    const edges = sortEdges(edgeRows.map(toEdge));

    return { nodes, edges };
  }

  /** Reproducible export: same graph state always yields the same checksum. */
  async exportIncidentGraph(incidentId: string, options: SubgraphOptions = {}) {
    const { nodes, edges } = await this.getSubgraph(incidentId, options);
    return {
      incidentId,
      generatedAt: new Date().toISOString(),
      checksum: computeGraphChecksum(nodes, edges),
      nodeCount: nodes.length,
      edgeCount: edges.length,
      nodes,
      edges,
    };
  }

  async getRevisions(incidentId: string, limit = 500) {
    const rows = await this.db("causal_graph_revisions")
      .where({ incident_id: incidentId })
      .orderBy("created_at", "asc")
      .limit(Math.min(limit, 2000));
    return rows.map((row: any) => ({
      id: row.id,
      incidentId: row.incident_id,
      nodeId: row.node_id ?? null,
      edgeId: row.edge_id ?? null,
      action: row.action,
      reason: row.reason ?? null,
      actor: row.actor,
      metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata ?? {},
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    }));
  }
}

let instance: CausalGraphService | null = null;
export function getCausalGraphService(): CausalGraphService {
  if (!instance) instance = new CausalGraphService();
  return instance;
}
