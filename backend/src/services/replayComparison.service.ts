import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface ReplaySnapshot {
  id: string;
  assetCode: string;
  snapshotType: string;
  snapshotData: Record<string, unknown>;
  snapshotTime: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DiffResult {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  type: "added" | "removed" | "changed";
}

export class ReplayComparisonService {
  async createSnapshot(
    assetCode: string,
    snapshotType: string,
    snapshotData: Record<string, unknown>,
    snapshotTime: Date
  ): Promise<ReplaySnapshot> {
    const db = getDatabase();
    const [snapshot] = await db("replay_snapshots")
      .insert({
        asset_code: assetCode,
        snapshot_type: snapshotType,
        snapshot_data: snapshotData,
        snapshot_time: snapshotTime,
      })
      .returning("*");
    return this.formatSnapshot(snapshot);
  }

  async getSnapshot(snapshotId: string): Promise<ReplaySnapshot | null> {
    const db = getDatabase();
    const snapshot = await db("replay_snapshots").where("id", snapshotId).first();
    return snapshot ? this.formatSnapshot(snapshot) : null;
  }

  async getSnapshotsForAsset(assetCode: string, limit = 10): Promise<ReplaySnapshot[]> {
    const db = getDatabase();
    const snapshots = await db("replay_snapshots")
      .where("asset_code", assetCode)
      .orderBy("snapshot_time", "desc")
      .limit(limit);
    return snapshots.map((s) => this.formatSnapshot(s));
  }

  compareSnapshots(snapshot1: ReplaySnapshot, snapshot2: ReplaySnapshot): DiffResult[] {
    const diffs: DiffResult[] = [];
    const allKeys = new Set([...Object.keys(snapshot1.snapshotData), ...Object.keys(snapshot2.snapshotData)]);

    for (const key of allKeys) {
      const val1 = snapshot1.snapshotData[key];
      const val2 = snapshot2.snapshotData[key];

      if (!(key in snapshot2.snapshotData)) {
        diffs.push({ field: key, oldValue: val1, newValue: undefined, type: "removed" });
      } else if (!(key in snapshot1.snapshotData)) {
        diffs.push({ field: key, oldValue: undefined, newValue: val2, type: "added" });
      } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        diffs.push({ field: key, oldValue: val1, newValue: val2, type: "changed" });
      }
    }

    return diffs;
  }

  private formatSnapshot(row: any): ReplaySnapshot {
    return {
      id: row.id,
      assetCode: row.asset_code,
      snapshotType: row.snapshot_type,
      snapshotData: row.snapshot_data,
      snapshotTime: row.snapshot_time,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
