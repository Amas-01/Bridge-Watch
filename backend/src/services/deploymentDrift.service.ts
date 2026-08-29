import { db } from "../database/db.js";
import type { PoolClient } from "pg";

export interface EnvironmentSnapshot {
  id: string;
  environmentName: string;
  environmentType: "production" | "staging" | "development" | "testing";
  snapshotVersion: string;
  configHash: string;
  deployedBy: string;
  deploymentTimestamp: Date;
}

export interface DeploymentDrift {
  id: string;
  fromEnvironment: string;
  toEnvironment: string;
  driftType: "version_mismatch" | "config_drift" | "state_drift" | "dependency_drift";
  driftScore: number;
  changedFields: string[];
  severity: "low" | "medium" | "high" | "critical";
  isApproved: boolean;
}

export interface DeploymentDriftAlert {
  id: string;
  driftRecordId: string;
  alertType: string;
  status: "open" | "acknowledged" | "resolved" | "ignored";
  description: string;
  remediationSteps: string[];
}

export const deploymentDriftService = {
  async createEnvironmentSnapshot(
    environmentName: string,
    environmentType: "production" | "staging" | "development" | "testing",
    snapshotVersion: string,
    configJson: Record<string, unknown>,
    deployedBy: string,
    deploymentTimestamp: Date,
    client?: PoolClient
  ): Promise<EnvironmentSnapshot> {
    const query = client || db;

    try {
      const configHash = require("crypto")
        .createHash("sha256")
        .update(JSON.stringify(configJson))
        .digest("hex");

      const result = await query.query(
        `INSERT INTO environment_snapshots
         (environment_name, environment_type, snapshot_version, config_hash, config_json, deployed_by, deployment_timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, environment_name, environment_type, snapshot_version, config_hash, deployed_by, deployment_timestamp`,
        [environmentName, environmentType, snapshotVersion, configHash, JSON.stringify(configJson), deployedBy, deploymentTimestamp]
      );

      return {
        id: result.rows[0].id,
        environmentName: result.rows[0].environment_name,
        environmentType: result.rows[0].environment_type,
        snapshotVersion: result.rows[0].snapshot_version,
        configHash: result.rows[0].config_hash,
        deployedBy: result.rows[0].deployed_by,
        deploymentTimestamp: result.rows[0].deployment_timestamp,
      };
    } catch (error) {
      throw new Error(`Failed to create environment snapshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async detectDrift(
    fromEnvironmentName: string,
    toEnvironmentName: string,
    client?: PoolClient
  ): Promise<DeploymentDrift> {
    const query = client || db;

    try {
      // Get latest snapshots for both environments
      const fromSnapshot = await query.query(
        `SELECT id, config_json FROM environment_snapshots
         WHERE environment_name = $1
         ORDER BY deployment_timestamp DESC
         LIMIT 1`,
        [fromEnvironmentName]
      );

      const toSnapshot = await query.query(
        `SELECT id, config_json FROM environment_snapshots
         WHERE environment_name = $1
         ORDER BY deployment_timestamp DESC
         LIMIT 1`,
        [toEnvironmentName]
      );

      if (fromSnapshot.rows.length === 0 || toSnapshot.rows.length === 0) {
        throw new Error("One or both environments have no snapshots");
      }

      const fromConfig = fromSnapshot.rows[0].config_json;
      const toConfig = toSnapshot.rows[0].config_json;

      // Compare configs
      const changedFields: string[] = [];
      let driftScore = 0;

      Object.keys({ ...fromConfig, ...toConfig }).forEach((key) => {
        if (JSON.stringify(fromConfig[key]) !== JSON.stringify(toConfig[key])) {
          changedFields.push(key);
          driftScore += 10;
        }
      });

      const severity: "low" | "medium" | "high" | "critical" =
        driftScore < 20 ? "low" : driftScore < 50 ? "medium" : driftScore < 100 ? "high" : "critical";

      const result = await query.query(
        `INSERT INTO deployment_drift_records
         (from_environment, to_environment, from_snapshot_id, to_snapshot_id, drift_type, drift_score, changed_fields, severity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, from_environment, to_environment, drift_type, drift_score, changed_fields, severity, is_approved`,
        [
          fromEnvironmentName,
          toEnvironmentName,
          fromSnapshot.rows[0].id,
          toSnapshot.rows[0].id,
          "config_drift",
          driftScore,
          changedFields,
          severity,
        ]
      );

      return {
        id: result.rows[0].id,
        fromEnvironment: result.rows[0].from_environment,
        toEnvironment: result.rows[0].to_environment,
        driftType: result.rows[0].drift_type,
        driftScore: result.rows[0].drift_score,
        changedFields: result.rows[0].changed_fields,
        severity: result.rows[0].severity,
        isApproved: result.rows[0].is_approved,
      };
    } catch (error) {
      throw new Error(`Failed to detect drift: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async approveDrift(driftRecordId: string, approvedBy: string, client?: PoolClient): Promise<void> {
    const query = client || db;

    try {
      await query.query(
        `UPDATE deployment_drift_records
         SET is_approved = true, approved_by = $1, approved_at = NOW()
         WHERE id = $2`,
        [approvedBy, driftRecordId]
      );
    } catch (error) {
      throw new Error(`Failed to approve drift: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async createDriftAlert(
    driftRecordId: string,
    alertType: string,
    description: string,
    remediationSteps: string[],
    client?: PoolClient
  ): Promise<DeploymentDriftAlert> {
    const query = client || db;

    try {
      const result = await query.query(
        `INSERT INTO deployment_drift_alerts
         (drift_record_id, alert_type, description, remediation_steps)
         VALUES ($1, $2, $3, $4)
         RETURNING id, drift_record_id, alert_type, status, description, remediation_steps`,
        [driftRecordId, alertType, description, remediationSteps]
      );

      return {
        id: result.rows[0].id,
        driftRecordId: result.rows[0].drift_record_id,
        alertType: result.rows[0].alert_type,
        status: result.rows[0].status,
        description: result.rows[0].description,
        remediationSteps: result.rows[0].remediation_steps,
      };
    } catch (error) {
      throw new Error(`Failed to create drift alert: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getDriftsByEnvironment(
    environmentName: string,
    limit: number = 50,
    offset: number = 0,
    client?: PoolClient
  ): Promise<DeploymentDrift[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, from_environment, to_environment, drift_type, drift_score, changed_fields, severity, is_approved
         FROM deployment_drift_records
         WHERE from_environment = $1 OR to_environment = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [environmentName, limit, offset]
      );

      return result.rows.map((row) => ({
        id: row.id,
        fromEnvironment: row.from_environment,
        toEnvironment: row.to_environment,
        driftType: row.drift_type,
        driftScore: row.drift_score,
        changedFields: row.changed_fields,
        severity: row.severity,
        isApproved: row.is_approved,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch drifts: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async getUnapprovedDrifts(limit: number = 50, offset: number = 0, client?: PoolClient): Promise<DeploymentDrift[]> {
    const query = client || db;

    try {
      const result = await query.query(
        `SELECT id, from_environment, to_environment, drift_type, drift_score, changed_fields, severity, is_approved
         FROM deployment_drift_records
         WHERE is_approved = false
         ORDER BY severity DESC, created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return result.rows.map((row) => ({
        id: row.id,
        fromEnvironment: row.from_environment,
        toEnvironment: row.to_environment,
        driftType: row.drift_type,
        driftScore: row.drift_score,
        changedFields: row.changed_fields,
        severity: row.severity,
        isApproved: row.is_approved,
      }));
    } catch (error) {
      throw new Error(`Failed to fetch unapproved drifts: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
};
