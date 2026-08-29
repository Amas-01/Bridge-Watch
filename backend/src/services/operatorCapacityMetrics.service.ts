import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface CapacitySnapshot {
  id: string;
  operatorAddress: string;
  bridgeId: string;
  maxCapacity: number;
  currentUtilization: number;
  utilizationPct: number;
  status: string;
  metadata: Record<string, unknown> | null;
  snapshotAt: Date;
}

export interface CapacityAlert {
  id: string;
  ownerAddress: string;
  operatorAddress: string;
  bridgeId: string;
  condition: string;
  thresholdPct: number;
  isActive: boolean;
  lastTriggeredAt: Date | null;
  createdAt: Date;
}

export class OperatorCapacityMetricsService {
  async recordSnapshot(
    operatorAddress: string,
    bridgeId: string,
    maxCapacity: number,
    currentUtilization: number,
    metadata?: Record<string, unknown>,
  ): Promise<CapacitySnapshot> {
    const db = getDatabase();
    const utilizationPct = maxCapacity > 0 ? (currentUtilization / maxCapacity) * 100 : 0;
    const status = utilizationPct >= 90 ? "critical" : utilizationPct >= 70 ? "high" : "normal";

    const [row] = await db("operator_capacity_snapshots")
      .insert({
        operator_address: operatorAddress,
        bridge_id: bridgeId,
        max_capacity: maxCapacity,
        current_utilization: currentUtilization,
        utilization_pct: utilizationPct,
        status,
        metadata: metadata ? JSON.stringify(metadata) : null,
      })
      .returning("*");

    // Check alerts
    await this.checkAlerts(operatorAddress, bridgeId, utilizationPct);

    return this.mapRow(row);
  }

  async getLatestSnapshot(operatorAddress: string, bridgeId: string): Promise<CapacitySnapshot | null> {
    const db = getDatabase();
    const row = await db("operator_capacity_snapshots")
      .where({ operator_address: operatorAddress, bridge_id: bridgeId })
      .orderBy("snapshot_at", "desc")
      .first();
    return row ? this.mapRow(row) : null;
  }

  async getSnapshots(
    operatorAddress?: string,
    bridgeId?: string,
    limit = 50,
    offset = 0,
  ): Promise<{ snapshots: CapacitySnapshot[]; total: number }> {
    const db = getDatabase();
    const query = db("operator_capacity_snapshots");
    if (operatorAddress) query.where("operator_address", operatorAddress);
    if (bridgeId) query.where("bridge_id", bridgeId);

    const [countResult] = await query.clone().count("id as count");
    const rows = await query.orderBy("snapshot_at", "desc").limit(limit).offset(offset);
    return { snapshots: rows.map(this.mapRow), total: Number(countResult?.count ?? 0) };
  }

  async getOperatorSummary(operatorAddress: string): Promise<{
    totalBridges: number;
    avgUtilization: number;
    criticalBridges: number;
    totalCapacity: number;
    totalUtilization: number;
  }> {
    const db = getDatabase();
    const rows = await db("operator_capacity_snapshots")
      .where("operator_address", operatorAddress)
      .orderBy("snapshot_at", "desc")
      .limit(100);

    // Get latest per bridge
    const latest = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (!latest.has(row.bridge_id)) latest.set(row.bridge_id, row);
    }

    const snapshots = Array.from(latest.values());
    const totalBridges = snapshots.length;
    const avgUtilization = totalBridges > 0 ? snapshots.reduce((sum, s) => sum + Number(s.utilization_pct), 0) / totalBridges : 0;
    const criticalBridges = snapshots.filter((s) => s.status === "critical").length;
    const totalCapacity = snapshots.reduce((sum, s) => sum + Number(s.max_capacity), 0);
    const totalUtilization = snapshots.reduce((sum, s) => sum + Number(s.current_utilization), 0);

    return { totalBridges, avgUtilization, criticalBridges, totalCapacity, totalUtilization };
  }

  async createAlert(ownerAddress: string, operatorAddress: string, bridgeId: string, condition: string, thresholdPct: number): Promise<CapacityAlert> {
    const db = getDatabase();
    const [row] = await db("operator_capacity_alerts")
      .insert({ owner_address: ownerAddress, operator_address: operatorAddress, bridge_id: bridgeId, condition, threshold_pct: thresholdPct })
      .returning("*");
    return this.mapAlertRow(row);
  }

  async listAlerts(ownerAddress: string): Promise<CapacityAlert[]> {
    const db = getDatabase();
    const rows = await db("operator_capacity_alerts").where("owner_address", ownerAddress).orderBy("created_at", "desc");
    return rows.map(this.mapAlertRow);
  }

  private async checkAlerts(operatorAddress: string, bridgeId: string, utilizationPct: number): Promise<void> {
    const db = getDatabase();
    const alerts = await db("operator_capacity_alerts")
      .where({ operator_address: operatorAddress, bridge_id: bridgeId, is_active: true });

    for (const alert of alerts) {
      const triggered =
        (alert.condition === "gte" && utilizationPct >= Number(alert.threshold_pct)) ||
        (alert.condition === "lte" && utilizationPct <= Number(alert.threshold_pct)) ||
        (alert.condition === "gt" && utilizationPct > Number(alert.threshold_pct)) ||
        (alert.condition === "lt" && utilizationPct < Number(alert.threshold_pct));

      if (triggered) {
        await db("operator_capacity_alerts").where("id", alert.id).update({ last_triggered_at: db.fn.now() });
        logger.warn({ operatorAddress, bridgeId, utilizationPct, alertId: alert.id }, "Capacity alert triggered");
      }
    }
  }

  private mapRow(row: Record<string, unknown>): CapacitySnapshot {
    return {
      id: row.id as string,
      operatorAddress: row.operator_address as string,
      bridgeId: row.bridge_id as string,
      maxCapacity: Number(row.max_capacity),
      currentUtilization: Number(row.current_utilization),
      utilizationPct: Number(row.utilization_pct),
      status: row.status as string,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : null,
      snapshotAt: row.snapshot_at as Date,
    };
  }

  private mapAlertRow(row: Record<string, unknown>): CapacityAlert {
    return {
      id: row.id as string,
      ownerAddress: row.owner_address as string,
      operatorAddress: row.operator_address as string,
      bridgeId: row.bridge_id as string,
      condition: row.condition as string,
      thresholdPct: Number(row.threshold_pct),
      isActive: row.is_active as boolean,
      lastTriggeredAt: row.last_triggered_at as Date | null,
      createdAt: row.created_at as Date,
    };
  }
}

export const operatorCapacityMetricsService = new OperatorCapacityMetricsService();
