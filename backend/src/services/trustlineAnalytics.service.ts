import { db } from "../database/db.js";
import type { PoolClient } from "pg";
import { logger } from "../utils/logger.js";

export interface TrustlineSnapshot {
  id: string;
  assetCode: string;
  assetIssuer: string;
  totalTrustlines: number;
  activeTrustlines: number;
  totalBalance: number;
  snapshotAt: Date;
  createdAt: Date;
}

export interface ConcentrationMetric {
  id: string;
  snapshotId: string;
  percentile: string;
  balancePercentage: number;
  createdAt: Date;
}

export interface TrustlineAnalyticsReport {
  snapshot: TrustlineSnapshot;
  concentration: ConcentrationMetric[];
}

export const trustlineAnalyticsService = {
  async recordSnapshot(
    assetCode: string,
    assetIssuer: string,
    totalTrustlines: number,
    activeTrustlines: number,
    totalBalance: number,
    concentration: Array<{ percentile: string; balancePercentage: number }>,
    client?: PoolClient
  ): Promise<TrustlineAnalyticsReport> {
    const query = client || db;
    try {
      const snapshotRes = await query.query(
        `INSERT INTO trustline_snapshots (asset_code, asset_issuer, total_trustlines, active_trustlines, total_balance)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, asset_code as "assetCode", asset_issuer as "assetIssuer", total_trustlines as "totalTrustlines", active_trustlines as "activeTrustlines", total_balance as "totalBalance", snapshot_at as "snapshotAt", created_at as "createdAt"`,
        [assetCode, assetIssuer, totalTrustlines, activeTrustlines, totalBalance]
      );
      const snapshot = snapshotRes.rows[0];
      snapshot.totalBalance = parseFloat(snapshot.totalBalance);

      const concentrationMetrics: ConcentrationMetric[] = [];
      for (const item of concentration) {
        const metricRes = await query.query(
          `INSERT INTO trustline_concentration_metrics (snapshot_id, percentile, balance_percentage)
           VALUES ($1, $2, $3)
           RETURNING id, snapshot_id as "snapshotId", percentile, balance_percentage as "balancePercentage", created_at as "createdAt"`,
          [snapshot.id, item.percentile, item.balancePercentage]
        );
        const metric = metricRes.rows[0];
        metric.balancePercentage = parseFloat(metric.balancePercentage);
        concentrationMetrics.push(metric);
      }

      logger.info(
        { assetCode, totalTrustlines, totalBalance },
        "Recorded trustline analytics snapshot"
      );

      return {
        snapshot,
        concentration: concentrationMetrics,
      };
    } catch (err) {
      throw new Error(`Failed to record trustline snapshot: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async getHistoricalSnapshots(
    assetCode: string,
    assetIssuer: string,
    limit = 100,
    client?: PoolClient
  ): Promise<TrustlineSnapshot[]> {
    const query = client || db;
    try {
      const res = await query.query(
        `SELECT id, asset_code as "assetCode", asset_issuer as "assetIssuer", total_trustlines as "totalTrustlines", active_trustlines as "activeTrustlines", total_balance as "totalBalance", snapshot_at as "snapshotAt", created_at as "createdAt"
         FROM trustline_snapshots
         WHERE asset_code = $1 AND asset_issuer = $2
         ORDER BY snapshot_at DESC
         LIMIT $3`,
        [assetCode, assetIssuer, limit]
      );
      return res.rows.map((row) => ({
        ...row,
        totalBalance: parseFloat(row.totalBalance),
      }));
    } catch (err) {
      throw new Error(`Failed to fetch historical snapshots: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async getLatestReport(
    assetCode: string,
    assetIssuer: string,
    client?: PoolClient
  ): Promise<TrustlineAnalyticsReport | null> {
    const query = client || db;
    try {
      const snapshotRes = await query.query(
        `SELECT id, asset_code as "assetCode", asset_issuer as "assetIssuer", total_trustlines as "totalTrustlines", active_trustlines as "activeTrustlines", total_balance as "totalBalance", snapshot_at as "snapshotAt", created_at as "createdAt"
         FROM trustline_snapshots
         WHERE asset_code = $1 AND asset_issuer = $2
         ORDER BY snapshot_at DESC
         LIMIT 1`,
        [assetCode, assetIssuer]
      );
      const snapshot = snapshotRes.rows[0];
      if (!snapshot) return null;

      snapshot.totalBalance = parseFloat(snapshot.totalBalance);

      const concentrationRes = await query.query(
        `SELECT id, snapshot_id as "snapshotId", percentile, balance_percentage as "balancePercentage", created_at as "createdAt"
         FROM trustline_concentration_metrics
         WHERE snapshot_id = $1
         ORDER BY percentile ASC`,
        [snapshot.id]
      );

      const concentration = concentrationRes.rows.map((row) => ({
        ...row,
        balancePercentage: parseFloat(row.balancePercentage),
      }));

      return {
        snapshot,
        concentration,
      };
    } catch (err) {
      throw new Error(`Failed to fetch latest report: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
};
