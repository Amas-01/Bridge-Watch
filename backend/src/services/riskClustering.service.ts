import { db } from "../database/db.js";
import type { PoolClient } from "pg";
import { logger } from "../utils/logger.js";

export interface Cluster {
  id: string;
  name: string;
  riskLevel: "low" | "moderate" | "high" | "critical";
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClusterMapping {
  id: string;
  clusterId: string;
  accountAddress: string;
  reason: string | null;
  confidenceScore: number;
  addedBy: string;
  createdAt: Date;
}

export interface RiskSignal {
  id: string;
  accountAddress: string;
  signalType: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  description: string | null;
  detectedAt: Date;
}

export const riskClusteringService = {
  async createCluster(
    name: string,
    riskLevel: "low" | "moderate" | "high" | "critical",
    description?: string,
    client?: PoolClient
  ): Promise<Cluster> {
    const query = client || db;
    try {
      const res = await query.query(
        `INSERT INTO stellar_account_clusters (name, risk_level, description)
         VALUES ($1, $2, $3)
         RETURNING id, name, risk_level as "riskLevel", description, created_at as "createdAt", updated_at as "updatedAt"`,
        [name, riskLevel, description || null]
      );
      const cluster = res.rows[0];
      logger.info({ clusterId: cluster.id, name }, "Created stellar account risk cluster");
      return cluster;
    } catch (err) {
      throw new Error(`Failed to create cluster: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async getClusters(client?: PoolClient): Promise<Cluster[]> {
    const query = client || db;
    try {
      const res = await query.query(
        `SELECT id, name, risk_level as "riskLevel", description, created_at as "createdAt", updated_at as "updatedAt"
         FROM stellar_account_clusters
         ORDER BY name ASC`
      );
      return res.rows;
    } catch (err) {
      throw new Error(`Failed to fetch clusters: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async getClusterById(id: string, client?: PoolClient): Promise<Cluster | null> {
    const query = client || db;
    try {
      const res = await query.query(
        `SELECT id, name, risk_level as "riskLevel", description, created_at as "createdAt", updated_at as "updatedAt"
         FROM stellar_account_clusters
         WHERE id = $1`,
        [id]
      );
      return res.rows[0] || null;
    } catch (err) {
      throw new Error(`Failed to fetch cluster: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async mapAccountToCluster(
    clusterId: string,
    accountAddress: string,
    addedBy: string,
    reason?: string,
    confidenceScore = 1.0,
    client?: PoolClient
  ): Promise<ClusterMapping> {
    const query = client || db;
    try {
      // Validate Stellar address length (56 chars starting with G)
      if (accountAddress.length !== 56 || !accountAddress.startsWith("G")) {
        throw new Error("Invalid Stellar account address format");
      }

      // Verify cluster exists
      const clusterExists = await this.getClusterById(clusterId, query as any);
      if (!clusterExists) {
        throw new Error("Cluster does not exist");
      }

      const res = await query.query(
        `INSERT INTO stellar_account_cluster_mappings (cluster_id, account_address, added_by, reason, confidence_score)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_address) DO UPDATE SET
           cluster_id = EXCLUDED.cluster_id,
           reason = EXCLUDED.reason,
           confidence_score = EXCLUDED.confidence_score,
           added_by = EXCLUDED.added_by
         RETURNING id, cluster_id as "clusterId", account_address as "accountAddress", reason, confidence_score as "confidenceScore", added_by as "addedBy", created_at as "createdAt"`,
        [clusterId, accountAddress, addedBy, reason || null, confidenceScore]
      );
      const mapping = res.rows[0];
      // Convert confidence_score from string representation returned by pg decimal to float
      mapping.confidenceScore = parseFloat(mapping.confidenceScore as any);
      logger.info({ clusterId, accountAddress }, "Mapped Stellar account to risk cluster");
      return mapping;
    } catch (err) {
      throw new Error(`Failed to map account: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async getAccountRiskProfile(accountAddress: string, client?: PoolClient): Promise<{
    accountAddress: string;
    cluster: Cluster | null;
    confidenceScore: number | null;
    reason: string | null;
    signals: RiskSignal[];
  }> {
    const query = client || db;
    try {
      // Get mapping & cluster info
      const mappingRes = await query.query(
        `SELECT m.confidence_score, m.reason, c.id, c.name, c.risk_level, c.description, c.created_at, c.updated_at
         FROM stellar_account_cluster_mappings m
         JOIN stellar_account_clusters c ON m.cluster_id = c.id
         WHERE m.account_address = $1`,
        [accountAddress]
      );

      // Get signals
      const signalsRes = await query.query(
        `SELECT id, account_address as "accountAddress", signal_type as "signalType", severity, description, detected_at as "detectedAt"
         FROM account_risk_signals
         WHERE account_address = $1
         ORDER BY detected_at DESC`,
        [accountAddress]
      );

      const mapping = mappingRes.rows[0];
      const signals = signalsRes.rows;

      return {
        accountAddress,
        cluster: mapping
          ? {
              id: mapping.id,
              name: mapping.name,
              riskLevel: mapping.risk_level,
              description: mapping.description,
              createdAt: mapping.created_at,
              updatedAt: mapping.updated_at,
            }
          : null,
        confidenceScore: mapping ? parseFloat(mapping.confidence_score) : null,
        reason: mapping ? mapping.reason : null,
        signals,
      };
    } catch (err) {
      throw new Error(`Failed to fetch account risk profile: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async recordRiskSignal(
    accountAddress: string,
    signalType: string,
    severity: "info" | "low" | "medium" | "high" | "critical",
    description?: string,
    client?: PoolClient
  ): Promise<RiskSignal> {
    const query = client || db;
    try {
      const res = await query.query(
        `INSERT INTO account_risk_signals (account_address, signal_type, severity, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, account_address as "accountAddress", signal_type as "signalType", severity, description, detected_at as "detectedAt"`,
        [accountAddress, signalType, severity, description || null]
      );
      const signal = res.rows[0];
      logger.info({ accountAddress, signalType, severity }, "Recorded account risk signal");
      return signal;
    } catch (err) {
      throw new Error(`Failed to record risk signal: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async getRiskSignals(limit = 50, offset = 0, client?: PoolClient): Promise<RiskSignal[]> {
    const query = client || db;
    try {
      const res = await query.query(
        `SELECT id, account_address as "accountAddress", signal_type as "signalType", severity, description, detected_at as "detectedAt"
         FROM account_risk_signals
         ORDER BY detected_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      return res.rows;
    } catch (err) {
      throw new Error(`Failed to query risk signals: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
};
