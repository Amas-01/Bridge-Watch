import { getDatabase } from "../connection.js";

export type AnomalySeverity = "low" | "medium" | "high" | "critical";
export type AnomalyType = "spike" | "drop" | "divergence" | "bridge_health" | "multi_signal";

export interface AnomalyThresholdRecord {
  id?: string;
  asset_code: string;
  bridge_name: string;
  price_change_pct: number;
  liquidity_change_pct: number;
  supply_mismatch_pct: number;
  health_score_drop: number;
  min_signal_count: number;
  duplicate_window_seconds: number;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface AnomalyEventRecord {
  id?: string;
  asset_code: string;
  bridge_name: string | null;
  type: AnomalyType;
  severity: AnomalySeverity;
  signals: unknown;
  explanation: unknown;
  metadata: unknown;
  fingerprint: string;
  detected_at: Date;
  suppressed_until: Date | null;
  is_suppressed: boolean;
  suppressed_by_event_id: string | null;
}

export interface AnomalyEventFilters {
  assetCode?: string;
  bridgeName?: string;
  severity?: AnomalySeverity;
  includeSuppressed?: boolean;
  limit?: number;
}

export interface AnomalyTuningProfileRecord {
  id?: string;
  name: string;
  deviation_multiplier: number;
  sliding_window_size: number;
  is_active: boolean;
  updated_by: string | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface AnomalyTuningOverrideRecord {
  id?: string;
  anomaly_type: AnomalyType | "*";
  asset_code: string;
  bridge_name: string;
  reason: string;
  starts_at: Date;
  expires_at: Date;
  created_by: string | null;
  created_at?: Date;
}

export class AnomalyModel {
  private db = getDatabase();

  async getActiveThresholds(): Promise<AnomalyThresholdRecord[]> {
    const rows = await this.db("anomaly_thresholds")
      .where({ is_active: true })
      .orderByRaw("CASE WHEN asset_code = '*' THEN 1 ELSE 0 END")
      .orderByRaw("CASE WHEN bridge_name = '*' THEN 1 ELSE 0 END");

    return rows.map(this.mapThreshold);
  }

  async getThresholds(): Promise<AnomalyThresholdRecord[]> {
    const rows = await this.db("anomaly_thresholds").orderBy("asset_code", "asc").orderBy("bridge_name", "asc");
    return rows.map(this.mapThreshold);
  }

  async upsertThreshold(input: Omit<AnomalyThresholdRecord, "id" | "created_at" | "updated_at">): Promise<AnomalyThresholdRecord> {
    const [row] = await this.db("anomaly_thresholds")
      .insert(input)
      .onConflict(["asset_code", "bridge_name"])
      .merge({
        price_change_pct: input.price_change_pct,
        liquidity_change_pct: input.liquidity_change_pct,
        supply_mismatch_pct: input.supply_mismatch_pct,
        health_score_drop: input.health_score_drop,
        min_signal_count: input.min_signal_count,
        duplicate_window_seconds: input.duplicate_window_seconds,
        is_active: input.is_active,
        updated_at: this.db.fn.now(),
      })
      .returning("*");

    return this.mapThreshold(row);
  }

  async findRecentFingerprint(fingerprint: string, since: Date): Promise<AnomalyEventRecord | undefined> {
    const row = await this.db("anomaly_events")
      .where({ fingerprint, is_suppressed: false })
      .andWhere("detected_at", ">=", since)
      .orderBy("detected_at", "desc")
      .first();

    return row ? this.mapEvent(row) : undefined;
  }

  async insertEvent(event: Omit<AnomalyEventRecord, "id">): Promise<AnomalyEventRecord> {
    const [row] = await this.db("anomaly_events").insert(event).returning("*");
    return this.mapEvent(row);
  }

  async getRecentEvents(filters: AnomalyEventFilters = {}): Promise<AnomalyEventRecord[]> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const query = this.db("anomaly_events").orderBy("detected_at", "desc").limit(limit);

    if (filters.assetCode) query.where("asset_code", filters.assetCode.toUpperCase());
    if (filters.bridgeName) query.where("bridge_name", filters.bridgeName);
    if (filters.severity) query.where("severity", filters.severity);
    if (!filters.includeSuppressed) query.where({ is_suppressed: false });

    const rows = await query;
    return rows.map(this.mapEvent);
  }

  async getActiveTuningProfile(): Promise<AnomalyTuningProfileRecord> {
    const row = await this.db("anomaly_tuning_profiles").where({ is_active: true }).orderBy("updated_at", "desc").first();
    if (!row) {
      throw new Error("No active anomaly tuning profile is configured");
    }
    return this.mapTuningProfile(row);
  }

  async updateActiveTuningProfile(
    input: Pick<AnomalyTuningProfileRecord, "deviation_multiplier" | "sliding_window_size" | "updated_by">
  ): Promise<AnomalyTuningProfileRecord> {
    const active = await this.getActiveTuningProfile();
    const [row] = await this.db("anomaly_tuning_profiles")
      .where({ id: active.id })
      .update({ ...input, updated_at: this.db.fn.now() })
      .returning("*");
    return this.mapTuningProfile(row);
  }

  async createTuningOverride(
    input: Omit<AnomalyTuningOverrideRecord, "id" | "created_at">
  ): Promise<AnomalyTuningOverrideRecord> {
    const [row] = await this.db("anomaly_tuning_overrides").insert(input).returning("*");
    return this.mapTuningOverride(row);
  }

  async getActiveTuningOverrides(at = new Date()): Promise<AnomalyTuningOverrideRecord[]> {
    const rows = await this.db("anomaly_tuning_overrides")
      .where("starts_at", "<=", at)
      .andWhere("expires_at", ">", at)
      .orderBy("expires_at", "asc");
    return rows.map(this.mapTuningOverride);
  }

  async findActiveTuningOverride(
    anomalyType: AnomalyType,
    assetCode: string,
    bridgeName: string | null,
    at = new Date()
  ): Promise<AnomalyTuningOverrideRecord | undefined> {
    const row = await this.db("anomaly_tuning_overrides")
      .where("starts_at", "<=", at)
      .andWhere("expires_at", ">", at)
      .whereIn("anomaly_type", ["*", anomalyType])
      .whereIn("asset_code", ["*", assetCode.toUpperCase()])
      .whereIn("bridge_name", ["*", bridgeName ?? "*"])
      .orderBy("expires_at", "desc")
      .first();
    return row ? this.mapTuningOverride(row) : undefined;
  }

  async deleteTuningOverride(id: string): Promise<boolean> {
    return (await this.db("anomaly_tuning_overrides").where({ id }).delete()) > 0;
  }

  private mapThreshold(row: any): AnomalyThresholdRecord {
    return {
      id: row.id,
      asset_code: row.asset_code,
      bridge_name: row.bridge_name,
      price_change_pct: Number(row.price_change_pct),
      liquidity_change_pct: Number(row.liquidity_change_pct),
      supply_mismatch_pct: Number(row.supply_mismatch_pct),
      health_score_drop: Number(row.health_score_drop),
      min_signal_count: Number(row.min_signal_count),
      duplicate_window_seconds: Number(row.duplicate_window_seconds),
      is_active: Boolean(row.is_active),
      created_at: row.created_at ? new Date(row.created_at) : undefined,
      updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  private mapEvent(row: any): AnomalyEventRecord {
    return {
      id: row.id,
      asset_code: row.asset_code,
      bridge_name: row.bridge_name,
      type: row.type,
      severity: row.severity,
      signals: row.signals,
      explanation: row.explanation,
      metadata: row.metadata,
      fingerprint: row.fingerprint,
      detected_at: new Date(row.detected_at),
      suppressed_until: row.suppressed_until ? new Date(row.suppressed_until) : null,
      is_suppressed: Boolean(row.is_suppressed),
      suppressed_by_event_id: row.suppressed_by_event_id,
    };
  }

  private mapTuningProfile(row: any): AnomalyTuningProfileRecord {
    return {
      id: row.id,
      name: row.name,
      deviation_multiplier: Number(row.deviation_multiplier),
      sliding_window_size: Number(row.sliding_window_size),
      is_active: Boolean(row.is_active),
      updated_by: row.updated_by ?? null,
      created_at: row.created_at ? new Date(row.created_at) : undefined,
      updated_at: row.updated_at ? new Date(row.updated_at) : undefined,
    };
  }

  private mapTuningOverride(row: any): AnomalyTuningOverrideRecord {
    return {
      id: row.id,
      anomaly_type: row.anomaly_type,
      asset_code: row.asset_code,
      bridge_name: row.bridge_name,
      reason: row.reason,
      starts_at: new Date(row.starts_at),
      expires_at: new Date(row.expires_at),
      created_by: row.created_by ?? null,
      created_at: row.created_at ? new Date(row.created_at) : undefined,
    };
  }
}
