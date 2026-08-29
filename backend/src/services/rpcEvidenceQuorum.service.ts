import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { Gauge, Counter } from "prom-client";

export interface ProviderResponseInput {
  endpoint: string;
  providerGroup?: string;
  blockNumber: number;
  blockHash: string;
  stateRoot?: string;
  timestamp?: number;
  data: unknown;
  error?: string;
}

export interface QuorumConfigRequest {
  chainId: string;
  operationType: string;
  minQuorumSize?: number;
  quorumThresholdRatio?: number;
  maxLagBlocks?: number;
  failClosed?: boolean;
  metadata?: Record<string, unknown>;
}

export interface QuorumEvaluationRequest {
  chainId: string;
  operationType: string;
  readIdentifier: string;
  responses: ProviderResponseInput[];
  overrideFailClosed?: boolean;
  minQuorumSize?: number;
  maxLagBlocks?: number;
}

export interface QuorumHeaderAnchor {
  canonicalBlockNumber: number;
  canonicalBlockHash: string;
  stateRoot?: string;
  consensusTimestamp: number;
}

export interface DisagreementDetails {
  disagreeingProviders: string[];
  laggingProviders: string[];
  correlatedGroups: Record<string, number>;
  reason?: string;
}

export interface QuorumEvaluationResult {
  accepted: boolean;
  decision: "ACCEPTED" | "DEGRADED" | "REJECTED";
  confidenceScore: number; // 0.0 to 1.0
  isDegraded: boolean;
  hasDisagreement: boolean;
  hasExcessiveLag: boolean;
  totalProviders: number;
  independentGroupsCount: number;
  agreedGroupsCount: number;
  headerAnchor: QuorumHeaderAnchor | null;
  agreedData: unknown | null;
  disagreementDetails: DisagreementDetails;
  failClosed: boolean;
}

// Prometheus metrics
export const quorumEvaluationsMetric = new Counter({
  name: "bridge_watch_rpc_quorum_evaluations_total",
  help: "Total RPC evidence quorum evaluations",
  labelNames: ["chain_id", "decision"],
});

export const quorumDisagreementsMetric = new Counter({
  name: "bridge_watch_rpc_quorum_disagreements_total",
  help: "Total RPC evidence disagreements detected",
  labelNames: ["chain_id"],
});

export const quorumConfidenceMetric = new Gauge({
  name: "bridge_watch_rpc_quorum_confidence_score",
  help: "Current confidence score for chain state reads",
  labelNames: ["chain_id"],
});

export class RpcEvidenceQuorumService {
  private readonly db = getDatabase();

  /**
   * Helper to derive a provider group from hostname if not explicitly provided
   */
  public deriveProviderGroup(endpoint: string, explicitGroup?: string): string {
    if (explicitGroup) return explicitGroup;
    try {
      const url = new URL(endpoint);
      const hostname = url.hostname.toLowerCase();
      if (hostname.includes("infura")) return "infura";
      if (hostname.includes("alchemy")) return "alchemy";
      if (hostname.includes("quicknode")) return "quicknode";
      if (hostname.includes("stellar.org") || hostname.includes("horizon")) return "stellar-foundation";
      if (hostname.includes("ankr")) return "ankr";
      return hostname;
    } catch {
      return endpoint;
    }
  }

  /**
   * Evaluates evidence quorum across independent provider responses
   */
  public async evaluateQuorum(req: QuorumEvaluationRequest): Promise<QuorumEvaluationResult> {
    const config = await this.getConfig(req.chainId, req.operationType);
    const minQuorumSize = req.minQuorumSize ?? config.minQuorumSize;
    const quorumRatio = config.quorumThresholdRatio;
    const maxLagBlocks = req.maxLagBlocks ?? config.maxLagBlocks;
    const failClosed = req.overrideFailClosed ?? config.failClosed;

    const validResponses = req.responses.filter((r) => !r.error);

    // Group responses by provider group to prevent correlated node bias
    const groupMap = new Map<string, ProviderResponseInput[]>();
    for (const resp of validResponses) {
      const groupKey = this.deriveProviderGroup(resp.endpoint, resp.providerGroup);
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
      }
      groupMap.get(groupKey)!.push(resp);
    }

    const independentGroupsCount = groupMap.size;
    const totalProviders = req.responses.length;

    // Detect highest block number across all valid responses
    const maxBlockNumber = validResponses.reduce((max, r) => Math.max(max, r.blockNumber), 0);

    const laggingProviders: string[] = [];
    const activeGroupVotes: { group: string; sample: ProviderResponseInput }[] = [];

    // Filter out responses that lag beyond maxLagBlocks relative to chain tip
    for (const [group, resps] of groupMap.entries()) {
      // Pick the most recent block response in this group
      const latestInGroup = resps.reduce((best, cur) => (cur.blockNumber > best.blockNumber ? cur : best), resps[0]);
      if (maxBlockNumber - latestInGroup.blockNumber > maxLagBlocks) {
        laggingProviders.push(...resps.map((r) => r.endpoint));
      } else {
        activeGroupVotes.push({ group, sample: latestInGroup });
      }
    }

    const hasExcessiveLag = laggingProviders.length > 0;

    // Group active votes by consensus key (blockHash + data fingerprint)
    const consensusBuckets = new Map<string, { count: number; sample: ProviderResponseInput; groups: string[] }>();

    for (const vote of activeGroupVotes) {
      const dataFingerprint = JSON.stringify(vote.sample.data);
      const key = `${vote.sample.blockHash}:${dataFingerprint}`;

      if (!consensusBuckets.has(key)) {
        consensusBuckets.set(key, { count: 0, sample: vote.sample, groups: [] });
      }
      const bucket = consensusBuckets.get(key)!;
      bucket.count++;
      bucket.groups.push(vote.group);
    }

    // Find bucket with max independent group votes
    let winningBucket: { count: number; sample: ProviderResponseInput; groups: string[] } | null = null;
    for (const bucket of consensusBuckets.values()) {
      if (!winningBucket || bucket.count > winningBucket.count) {
        winningBucket = bucket;
      }
    }

    const agreedGroupsCount = winningBucket ? winningBucket.count : 0;
    const quorumThresholdCount = Math.max(minQuorumSize, Math.ceil(independentGroupsCount * quorumRatio));
    const isQuorumReached = agreedGroupsCount >= quorumThresholdCount && independentGroupsCount >= minQuorumSize;

    // Identify disagreeing providers
    const disagreeingProviders: string[] = [];
    if (winningBucket) {
      for (const resp of validResponses) {
        const respGroup = this.deriveProviderGroup(resp.endpoint, resp.providerGroup);
        if (!winningBucket.groups.includes(respGroup)) {
          disagreeingProviders.push(resp.endpoint);
        }
      }
    }

    const hasDisagreement = disagreeingProviders.length > 0 || consensusBuckets.size > 1;

    if (hasDisagreement) {
      quorumDisagreementsMetric.inc({ chain_id: req.chainId });
    }

    // Compute degraded confidence score (1.0 = perfect consensus, lower for lag/disagreement/low quorum)
    let confidenceScore = 1.0;
    if (independentGroupsCount < minQuorumSize) confidenceScore -= 0.4;
    if (hasDisagreement) confidenceScore -= 0.3;
    if (hasExcessiveLag) confidenceScore -= 0.2;
    if (!isQuorumReached) confidenceScore -= 0.3;

    confidenceScore = Math.max(0.0, Math.min(1.0, Number(confidenceScore.toFixed(2))));
    quorumConfidenceMetric.set({ chain_id: req.chainId }, confidenceScore);

    const isDegraded = confidenceScore < 0.9 || hasDisagreement || hasExcessiveLag || !isQuorumReached;

    // Determine final decision
    let decision: "ACCEPTED" | "DEGRADED" | "REJECTED" = "ACCEPTED";
    let accepted = true;

    if (!isQuorumReached || confidenceScore < 0.5) {
      if (failClosed) {
        decision = "REJECTED";
        accepted = false;
      } else {
        decision = "DEGRADED";
        accepted = true;
      }
    } else if (isDegraded) {
      decision = "DEGRADED";
      accepted = true;
    }

    quorumEvaluationsMetric.inc({ chain_id: req.chainId, decision });

    const headerAnchor: QuorumHeaderAnchor | null = winningBucket
      ? {
          canonicalBlockNumber: winningBucket.sample.blockNumber,
          canonicalBlockHash: winningBucket.sample.blockHash,
          stateRoot: winningBucket.sample.stateRoot,
          consensusTimestamp: winningBucket.sample.timestamp || Date.now(),
        }
      : null;

    const correlatedGroups: Record<string, number> = {};
    for (const [group, resps] of groupMap.entries()) {
      correlatedGroups[group] = resps.length;
    }

    const result: QuorumEvaluationResult = {
      accepted,
      decision,
      confidenceScore,
      isDegraded,
      hasDisagreement,
      hasExcessiveLag,
      totalProviders,
      independentGroupsCount,
      agreedGroupsCount,
      headerAnchor,
      agreedData: winningBucket ? winningBucket.sample.data : null,
      disagreementDetails: {
        disagreeingProviders,
        laggingProviders,
        correlatedGroups,
        reason: !isQuorumReached ? "Quorum threshold not reached across independent groups" : undefined,
      },
      failClosed,
    };

    // Persist result to database audit log
    await this.persistEvidenceLog(req, result);

    if (!accepted && failClosed) {
      throw new Error(
        `RPC Evidence Quorum rejected read for ${req.readIdentifier} on ${req.chainId} (confidence: ${confidenceScore}, failClosed: true)`
      );
    }

    return result;
  }

  /**
   * Sets or updates per-chain/operation quorum configuration
   */
  public async setConfig(configReq: QuorumConfigRequest): Promise<unknown> {
    const hasTable = await this.db.schema.hasTable("rpc_evidence_quorum_configs");
    if (!hasTable) return configReq;

    const existing = await this.db("rpc_evidence_quorum_configs")
      .where({ chain_id: configReq.chainId, operation_type: configReq.operationType })
      .first();

    const data = {
      chain_id: configReq.chainId,
      operation_type: configReq.operationType,
      min_quorum_size: configReq.minQuorumSize ?? 2,
      quorum_threshold_ratio: configReq.quorumThresholdRatio ?? 0.67,
      max_lag_blocks: configReq.maxLagBlocks ?? 5,
      fail_closed: configReq.failClosed ?? false,
      metadata: JSON.stringify(configReq.metadata || {}),
      updated_at: new Date(),
    };

    if (existing) {
      await this.db("rpc_evidence_quorum_configs").where({ id: existing.id }).update(data);
      return { ...existing, ...data };
    }

    const [inserted] = await this.db("rpc_evidence_quorum_configs").insert(data).returning("*");
    return inserted || data;
  }

  /**
   * Fetches per-chain/operation quorum configuration
   */
  public async getConfig(chainId: string, operationType: string): Promise<{
    minQuorumSize: number;
    quorumThresholdRatio: number;
    maxLagBlocks: number;
    failClosed: boolean;
  }> {
    const defaultConfig = {
      minQuorumSize: 2,
      quorumThresholdRatio: 0.67,
      maxLagBlocks: 5,
      failClosed: false,
    };

    try {
      const hasTable = await this.db.schema.hasTable("rpc_evidence_quorum_configs");
      if (!hasTable) return defaultConfig;

      const row = await this.db("rpc_evidence_quorum_configs")
        .where({ chain_id: chainId, operation_type: operationType })
        .first();

      if (!row) return defaultConfig;

      return {
        minQuorumSize: row.min_quorum_size,
        quorumThresholdRatio: Number(row.quorum_threshold_ratio),
        maxLagBlocks: row.max_lag_blocks,
        failClosed: Boolean(row.fail_closed),
      };
    } catch {
      return defaultConfig;
    }
  }

  /**
   * Fetches evidence evaluation logs
   */
  public async getEvidenceLogs(chainId?: string, limit = 20): Promise<unknown[]> {
    try {
      const hasTable = await this.db.schema.hasTable("rpc_evidence_logs");
      if (!hasTable) return [];

      let query = this.db("rpc_evidence_logs").select("*").orderBy("evaluated_at", "desc").limit(limit);

      if (chainId) {
        query = query.where({ chain_id: chainId });
      }

      return await query;
    } catch (err) {
      logger.error({ err }, "Failed to fetch RPC evidence logs");
      return [];
    }
  }

  /**
   * Maps provider endpoint to group in DB
   */
  public async registerProviderGroup(endpointUrl: string, providerGroup: string, asnOrOrg?: string): Promise<unknown> {
    const hasTable = await this.db.schema.hasTable("rpc_provider_groups");
    if (!hasTable) return { endpointUrl, providerGroup };

    const data = {
      endpoint_url: endpointUrl,
      provider_group: providerGroup,
      asn_or_org: asnOrOrg || null,
      is_active: true,
      updated_at: new Date(),
    };

    const existing = await this.db("rpc_provider_groups").where({ endpoint_url: endpointUrl }).first();
    if (existing) {
      await this.db("rpc_provider_groups").where({ id: existing.id }).update(data);
      return { ...existing, ...data };
    }

    const [inserted] = await this.db("rpc_provider_groups").insert(data).returning("*");
    return inserted || data;
  }

  private async persistEvidenceLog(req: QuorumEvaluationRequest, result: QuorumEvaluationResult): Promise<void> {
    try {
      const hasTable = await this.db.schema.hasTable("rpc_evidence_logs");
      if (!hasTable) return;

      await this.db("rpc_evidence_logs").insert({
        chain_id: req.chainId,
        operation_type: req.operationType,
        read_identifier: req.readIdentifier,
        total_providers: result.totalProviders,
        independent_groups_count: result.independentGroupsCount,
        confidence_score: result.confidenceScore,
        is_degraded: result.isDegraded,
        has_disagreement: result.hasDisagreement,
        has_excessive_lag: result.hasExcessiveLag,
        decision: result.decision,
        header_anchors: JSON.stringify(result.headerAnchor || {}),
        provider_responses: JSON.stringify(req.responses),
        disagreement_details: JSON.stringify(result.disagreementDetails),
        evaluated_at: new Date(),
      });
    } catch (err) {
      logger.warn({ err, chainId: req.chainId }, "Failed to persist RPC evidence log");
    }
  }
}

export const rpcEvidenceQuorumService = new RpcEvidenceQuorumService();
