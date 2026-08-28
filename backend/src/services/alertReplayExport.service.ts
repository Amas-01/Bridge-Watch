import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface ReplayExportFilter {
  assetCode?: string;
  alertType?: string;
  priority?: string;
  startDate?: string;
  endDate?: string;
  ruleId?: string;
}

export interface ReplayExport {
  id: string;
  ownerAddress: string;
  status: "pending" | "processing" | "completed" | "failed";
  filterCriteria: ReplayExportFilter;
  format: "csv" | "json";
  filePath: string | null;
  recordCount: number | null;
  fileSizeBytes: number | null;
  errorMessage: string | null;
  requestedAt: Date;
  completedAt: Date | null;
}

export interface ReplayEvent {
  id: string;
  exportId: string;
  eventId: string;
  ruleId: string;
  assetCode: string;
  alertType: string;
  priority: string;
  triggeredValue: number;
  threshold: number;
  metric: string;
  context: Record<string, unknown> | null;
  triggeredAt: Date;
}

export class AlertReplayExportService {
  async createExport(
    ownerAddress: string,
    filter: ReplayExportFilter,
    format: "csv" | "json" = "csv",
  ): Promise<ReplayExport> {
    const db = getDatabase();
    const [row] = await db("alert_replay_exports")
      .insert({
        owner_address: ownerAddress,
        filter_criteria: JSON.stringify(filter),
        format,
      })
      .returning("*");

    logger.info({ exportId: row.id, ownerAddress }, "Alert replay export requested");

    // Trigger async processing
    this.processExport(row.id).catch((err) => {
      logger.error({ exportId: row.id, error: err }, "Failed to process alert replay export");
    });

    return this.mapRow(row);
  }

  async getExport(id: string): Promise<ReplayExport | null> {
    const db = getDatabase();
    const row = await db("alert_replay_exports").where("id", id).first();
    return row ? this.mapRow(row) : null;
  }

  async listExports(
    ownerAddress: string,
    limit = 20,
    offset = 0,
  ): Promise<{ exports: ReplayExport[]; total: number }> {
    const db = getDatabase();
    const query = db("alert_replay_exports").where("owner_address", ownerAddress);

    const [countResult] = await query.clone().count("id as count");
    const total = Number(countResult?.count ?? 0);

    const rows = await query
      .orderBy("requested_at", "desc")
      .limit(limit)
      .offset(offset);

    return { exports: rows.map(this.mapRow), total };
  }

  async getExportEvents(exportId: string): Promise<ReplayEvent[]> {
    const db = getDatabase();
    const rows = await db("alert_replay_events")
      .where("export_id", exportId)
      .orderBy("triggered_at", "asc");

    return rows.map((row) => ({
      id: row.id,
      exportId: row.export_id,
      eventId: row.event_id,
      ruleId: row.rule_id,
      assetCode: row.asset_code,
      alertType: row.alert_type,
      priority: row.priority,
      triggeredValue: Number(row.triggered_value),
      threshold: Number(row.threshold),
      metric: row.metric,
      context: row.context ? JSON.parse(row.context) : null,
      triggeredAt: row.triggered_at,
    }));
  }

  async deleteExport(id: string): Promise<boolean> {
    const db = getDatabase();
    const deleted = await db("alert_replay_exports").where("id", id).del();
    return deleted > 0;
  }

  private async processExport(exportId: string): Promise<void> {
    const db = getDatabase();

    await db("alert_replay_exports")
      .where("id", exportId)
      .update({ status: "processing" });

    try {
      const exportRecord = await db("alert_replay_exports").where("id", exportId).first();
      if (!exportRecord) throw new Error("Export not found");

      const filter = JSON.parse(exportRecord.filter_criteria);
      let query = db("alert_events").select("*");

      if (filter.assetCode) query = query.where("asset_code", filter.assetCode);
      if (filter.alertType) query = query.where("alert_type", filter.alertType);
      if (filter.priority) query = query.where("priority", filter.priority);
      if (filter.ruleId) query = query.where("rule_id", filter.ruleId);
      if (filter.startDate) query = query.where("time", ">=", filter.startDate);
      if (filter.endDate) query = query.where("time", "<=", filter.endDate);

      const events = await query.orderBy("time", "asc").limit(10000);

      // Store replay events
      if (events.length > 0) {
        const replayEvents = events.map((e) => ({
          export_id: exportId,
          event_id: e.event_id || e.id,
          rule_id: e.rule_id,
          asset_code: e.asset_code,
          alert_type: e.alert_type,
          priority: e.priority,
          triggered_value: e.triggered_value,
          threshold: e.threshold,
          metric: e.metric,
          context: e.context ? JSON.stringify(e.context) : null,
          triggered_at: e.time,
        }));

        // Batch insert in chunks of 500
        for (let i = 0; i < replayEvents.length; i += 500) {
          await db("alert_replay_events").insert(replayEvents.slice(i, i + 500));
        }
      }

      await db("alert_replay_exports")
        .where("id", exportId)
        .update({
          status: "completed",
          record_count: events.length,
          completed_at: db.fn.now(),
        });

      logger.info({ exportId, recordCount: events.length }, "Alert replay export completed");
    } catch (error) {
      await db("alert_replay_exports")
        .where("id", exportId)
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "Unknown error",
        });
      throw error;
    }
  }

  private mapRow(row: Record<string, unknown>): ReplayExport {
    return {
      id: row.id as string,
      ownerAddress: row.owner_address as string,
      status: row.status as ReplayExport["status"],
      filterCriteria: JSON.parse(row.filter_criteria as string),
      format: row.format as "csv" | "json",
      filePath: row.file_path as string | null,
      recordCount: row.record_count as number | null,
      fileSizeBytes: row.file_size_bytes as number | null,
      errorMessage: row.error_message as string | null,
      requestedAt: row.requested_at as Date,
      completedAt: row.completed_at as Date | null,
    };
  }
}

export const alertReplayExportService = new AlertReplayExportService();
