import { db } from "../database/db.js";
import type { PoolClient } from "pg";
import { logger } from "../utils/logger.js";

export interface IssuerAuthState {
  id: string;
  issuerAddress: string;
  assetCode: string;
  authRequired: boolean;
  authRevocable: boolean;
  authClawbackEnabled: boolean;
  authImmutable: boolean;
  lastCheckedAt: Date;
  createdAt: Date;
}

export interface IssuerAuthAlert {
  id: string;
  issuerAddress: string;
  assetCode: string;
  alertType: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string | null;
  resolved: boolean;
  resolvedAt: Date | null;
  createdAt: Date;
}

export const issuerAuthService = {
  async getLatestAuthState(
    issuerAddress: string,
    assetCode: string,
    client?: PoolClient
  ): Promise<IssuerAuthState | null> {
    const query = client || db;
    try {
      const res = await query.query(
        `SELECT id, issuer_address as "issuerAddress", asset_code as "assetCode",
                auth_required as "authRequired", auth_revocable as "authRevocable",
                auth_clawback_enabled as "authClawbackEnabled", auth_immutable as "authImmutable",
                last_checked_at as "lastCheckedAt", created_at as "createdAt"
         FROM issuer_auth_states
         WHERE issuer_address = $1 AND asset_code = $2
         ORDER BY last_checked_at DESC
         LIMIT 1`,
        [issuerAddress, assetCode]
      );
      return res.rows[0] || null;
    } catch (err) {
      throw new Error(`Failed to fetch latest auth state: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async recordAuthState(
    issuerAddress: string,
    assetCode: string,
    authRequired: boolean,
    authRevocable: boolean,
    authClawbackEnabled: boolean,
    authImmutable: boolean,
    client?: PoolClient
  ): Promise<{ state: IssuerAuthState; alertsTriggered: IssuerAuthAlert[] }> {
    const query = client || db;
    try {
      // Fetch latest state to check for transitions/changes
      const lastState = await this.getLatestAuthState(issuerAddress, assetCode, query as any);

      // Insert new state
      const stateRes = await query.query(
        `INSERT INTO issuer_auth_states (issuer_address, asset_code, auth_required, auth_revocable, auth_clawback_enabled, auth_immutable)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, issuer_address as "issuerAddress", asset_code as "assetCode",
                   auth_required as "authRequired", auth_revocable as "authRevocable",
                   auth_clawback_enabled as "authClawbackEnabled", auth_immutable as "authImmutable",
                   last_checked_at as "lastCheckedAt", created_at as "createdAt"`,
        [issuerAddress, assetCode, authRequired, authRevocable, authClawbackEnabled, authImmutable]
      );
      const state = stateRes.rows[0];

      const alertsTriggered: IssuerAuthAlert[] = [];

      // Detect transitions and trigger alerts
      if (lastState) {
        const changes: string[] = [];
        if (lastState.authRequired !== authRequired) {
          changes.push(`authRequired changed from ${lastState.authRequired} to ${authRequired}`);
          const alert = await this.createAlert(
            issuerAddress,
            assetCode,
            "auth_required_changed",
            "medium",
            `Authorization requirement setting changed from ${lastState.authRequired} to ${authRequired}`,
            query
          );
          alertsTriggered.push(alert);
        }
        if (lastState.authRevocable !== authRevocable) {
          changes.push(`authRevocable changed from ${lastState.authRevocable} to ${authRevocable}`);
          const alert = await this.createAlert(
            issuerAddress,
            assetCode,
            "auth_revocable_changed",
            "high",
            `Authorization revocability setting changed from ${lastState.authRevocable} to ${authRevocable}`,
            query
          );
          alertsTriggered.push(alert);
        }
        if (lastState.authClawbackEnabled !== authClawbackEnabled) {
          changes.push(`authClawbackEnabled changed from ${lastState.authClawbackEnabled} to ${authClawbackEnabled}`);
          const alert = await this.createAlert(
            issuerAddress,
            assetCode,
            "clawback_state_changed",
            "critical",
            `Asset clawback enabled flag changed from ${lastState.authClawbackEnabled} to ${authClawbackEnabled}`,
            query
          );
          alertsTriggered.push(alert);
        }
        if (lastState.authImmutable !== authImmutable) {
          changes.push(`authImmutable changed from ${lastState.authImmutable} to ${authImmutable}`);
          const alert = await this.createAlert(
            issuerAddress,
            assetCode,
            "auth_immutability_changed",
            "high",
            `Authorization settings immutability changed from ${lastState.authImmutable} to ${authImmutable}`,
            query
          );
          alertsTriggered.push(alert);
        }

        if (changes.length > 0) {
          logger.warn(
            { issuerAddress, assetCode, changes },
            "Issuer authorization settings changed! Triggered alerts."
          );
        }
      }

      logger.info({ issuerAddress, assetCode }, "Recorded issuer auth state");
      return { state, alertsTriggered };
    } catch (err) {
      throw new Error(`Failed to record auth state: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async createAlert(
    issuerAddress: string,
    assetCode: string,
    alertType: string,
    severity: "low" | "medium" | "high" | "critical",
    description: string,
    client?: PoolClient
  ): Promise<IssuerAuthAlert> {
    const query = client || db;
    const res = await query.query(
      `INSERT INTO issuer_auth_alerts (issuer_address, asset_code, alert_type, severity, description)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, issuer_address as "issuerAddress", asset_code as "assetCode",
                 alert_type as "alertType", severity, description, resolved,
                 resolved_at as "resolvedAt", created_at as "createdAt"`,
      [issuerAddress, assetCode, alertType, severity, description]
    );
    return res.rows[0];
  },

  async getActiveAlerts(client?: PoolClient): Promise<IssuerAuthAlert[]> {
    const query = client || db;
    try {
      const res = await query.query(
        `SELECT id, issuer_address as "issuerAddress", asset_code as "assetCode",
                alert_type as "alertType", severity, description, resolved,
                resolved_at as "resolvedAt", created_at as "createdAt"
         FROM issuer_auth_alerts
         WHERE resolved = false
         ORDER BY created_at DESC`
      );
      return res.rows;
    } catch (err) {
      throw new Error(`Failed to fetch active alerts: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  async resolveAlert(id: string, client?: PoolClient): Promise<IssuerAuthAlert | null> {
    const query = client || db;
    try {
      const res = await query.query(
        `UPDATE issuer_auth_alerts
         SET resolved = true, resolved_at = NOW()
         WHERE id = $1
         RETURNING id, issuer_address as "issuerAddress", asset_code as "assetCode",
                   alert_type as "alertType", severity, description, resolved,
                   resolved_at as "resolvedAt", created_at as "createdAt"`,
        [id]
      );
      const alert = res.rows[0] || null;
      if (alert) {
        logger.info({ alertId: id }, "Resolved issuer auth alert");
      }
      return alert;
    } catch (err) {
      throw new Error(`Failed to resolve alert: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
};
