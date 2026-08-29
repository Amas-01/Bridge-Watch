import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type AssetState =
  | "INITIALIZED"
  | "PROVISIONED"
  | "ACTIVE"
  | "PAUSED"
  | "DEPRECATED"
  | "RETIRED";

export interface AssetLifecycleRecord {
  id: string;
  assetId: string;
  assetSymbol: string;
  state: AssetState;
  previousState: AssetState | null;
  reason: string | null;
  triggeredBy: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AssetLifecycleStats {
  totalTransitions: number;
  byState: Record<AssetState, number>;
  activeAssets: number;
}

interface Row {
  [key: string]: unknown;
}

export class AssetLifecycleTimelineService {
  async recordTransition(input: {
    assetId: string;
    assetSymbol: string;
    state: AssetState;
    previousState?: AssetState;
    reason?: string;
    triggeredBy: string;
    metadata?: Record<string, unknown>;
  }): Promise<AssetLifecycleRecord> {
    const db = getDatabase();

    if (!input.assetId?.trim() || !input.assetSymbol?.trim()) {
      throw new Error("assetId and assetSymbol are required");
    }
    if (!input.state?.trim() || !input.triggeredBy?.trim()) {
      throw new Error("state and triggeredBy are required");
    }

    const [inserted] = await db("asset_lifecycle_timeline")
      .insert({
        asset_id: input.assetId.trim(),
        asset_symbol: input.assetSymbol.trim(),
        state: input.state,
        previous_state: input.previousState ?? null,
        reason: input.reason ?? null,
        triggered_by: input.triggeredBy.trim(),
        metadata: JSON.stringify(input.metadata ?? {}),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "asset_lifecycle_timeline",
        action: "state_transition",
        asset_id: input.assetId,
        state: input.state,
        triggered_by: input.triggeredBy,
      },
      "Asset lifecycle state transition recorded"
    );

    return this.mapRow(inserted as Row);
  }

  async getTimeline(
    assetId?: string,
    filters?: {
      state?: AssetState;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<AssetLifecycleRecord[]> {
    const db = getDatabase();
    const rows = (await db("asset_lifecycle_timeline")
      .modify((qb) => {
        if (assetId) {
          qb.where("asset_id", assetId);
        }
        if (filters?.state) {
          qb.where("state", filters.state);
        }
        if (filters?.startDate) {
          qb.where("created_at", ">=", new Date(filters.startDate));
        }
        if (filters?.endDate) {
          qb.where("created_at", "<=", new Date(filters.endDate));
        }
      })
      .orderBy("created_at", "desc")
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0)) as Row[];

    return rows.map((row) => this.mapRow(row));
  }

  async getLatestState(assetId: string): Promise<AssetLifecycleRecord | null> {
    const db = getDatabase();
    const row = (await db("asset_lifecycle_timeline")
      .where("asset_id", assetId)
      .orderBy("created_at", "desc")
      .first()) as Row | undefined;

    return row ? this.mapRow(row) : null;
  }

  async getStats(): Promise<AssetLifecycleStats> {
    const db = getDatabase();
    const rows = (await db("asset_lifecycle_timeline")
      .select("state")
      .select(db.raw("count(*)::int as cnt"))
      .groupBy("state")) as Row[];

    const activeRows = (await db("asset_lifecycle_timeline")
      .distinct("asset_id")
      .where("state", "ACTIVE")) as Row[];

    const byState: Record<AssetState, number> = {
      INITIALIZED: 0,
      PROVISIONED: 0,
      ACTIVE: 0,
      PAUSED: 0,
      DEPRECATED: 0,
      RETIRED: 0,
    };

    let totalTransitions = 0;
    for (const row of rows) {
      const state = String(row.state) as AssetState;
      if (state in byState) {
        byState[state] = Number(row.cnt);
      }
      totalTransitions += Number(row.cnt);
    }

    return {
      totalTransitions,
      byState,
      activeAssets: activeRows.length,
    };
  }

  private mapRow(row: Row): AssetLifecycleRecord {
    return {
      id: String(row.id),
      assetId: String(row.asset_id),
      assetSymbol: String(row.asset_symbol),
      state: String(row.state) as AssetState,
      previousState: row.previous_state ? (String(row.previous_state) as AssetState) : null,
      reason: row.reason ? String(row.reason) : null,
      triggeredBy: String(row.triggered_by),
      metadata: this.parseObject(row.metadata),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private parseObject(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "object") return value as Record<string, unknown>;
    try {
      return JSON.parse(String(value));
    } catch {
      return {};
    }
  }
}

export const assetLifecycleTimelineService = new AssetLifecycleTimelineService();
