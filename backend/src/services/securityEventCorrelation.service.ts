import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export interface SecurityEventCorrelationRecord {
  id: string;
  title: string;
  description?: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "active" | "investigating" | "resolved" | "archived";
  correlation_rule: Record<string, unknown> | string;
  event_count: number;
  source_systems: string[] | string;
  time_window_minutes: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface SecurityEventRecord {
  id: string;
  correlation_id?: string;
  event_type: string;
  source: string;
  severity: "low" | "medium" | "high" | "critical";
  actor?: string;
  ip_address?: string;
  details: Record<string, unknown> | string;
  timestamp: string;
}

export class SecurityEventCorrelationService {
  private db() {
    return getDatabase();
  }

  async listCorrelations(filters?: { severity?: string; status?: string; search?: string }) {
    let query = this.db()("security_event_correlations");

    if (filters?.severity) {
      query = query.where("severity", filters.severity);
    }
    if (filters?.status) {
      query = query.where("status", filters.status);
    }
    if (filters?.search) {
      query = query.where((builder) => {
        builder
          .where("title", "ilike", `%${filters.search}%`)
          .orWhere("description", "ilike", `%${filters.search}%`);
      });
    }

    const rows = await query.orderBy("created_at", "desc");
    return rows.map(this.formatCorrelation);
  }

  async getCorrelationById(id: string) {
    const row = await this.db()("security_event_correlations").where({ id }).first();
    if (!row) return null;

    const events = await this.db()("security_events")
      .where({ correlation_id: id })
      .orderBy("timestamp", "desc");

    return {
      ...this.formatCorrelation(row),
      events: events.map(this.formatEvent),
    };
  }

  async createCorrelation(data: {
    title: string;
    description?: string;
    severity?: "low" | "medium" | "high" | "critical";
    correlationRule?: Record<string, unknown>;
    sourceSystems?: string[];
    timeWindowMinutes?: number;
    createdBy?: string;
  }) {
    if (!data.title?.trim()) {
      throw new Error("title is required");
    }

    const [row] = await this.db()("security_event_correlations")
      .insert({
        title: data.title.trim(),
        description: data.description ?? null,
        severity: data.severity ?? "medium",
        status: "active",
        correlation_rule: JSON.stringify(data.correlationRule ?? {}),
        source_systems: JSON.stringify(data.sourceSystems ?? []),
        time_window_minutes: data.timeWindowMinutes ?? 60,
        created_by: data.createdBy ?? "system",
      })
      .returning("*");

    return this.formatCorrelation(row);
  }

  async updateCorrelationStatus(
    id: string,
    status: "active" | "investigating" | "resolved" | "archived",
    updatedBy?: string
  ) {
    const [row] = await this.db()("security_event_correlations")
      .where({ id })
      .update({
        status,
        updated_at: this.db().fn.now(),
      })
      .returning("*");

    if (!row) return null;
    logger.info({ id, status, updatedBy }, "Updated security event correlation status");
    return this.formatCorrelation(row);
  }

  async ingestSecurityEvent(data: {
    correlationId?: string;
    eventType: string;
    source: string;
    severity?: "low" | "medium" | "high" | "critical";
    actor?: string;
    ipAddress?: string;
    details?: Record<string, unknown>;
  }) {
    if (!data.eventType?.trim()) {
      throw new Error("eventType is required");
    }
    if (!data.source?.trim()) {
      throw new Error("source is required");
    }

    const [eventRow] = await this.db()("security_events")
      .insert({
        correlation_id: data.correlationId ?? null,
        event_type: data.eventType.trim(),
        source: data.source.trim(),
        severity: data.severity ?? "medium",
        actor: data.actor ?? null,
        ip_address: data.ipAddress ?? null,
        details: JSON.stringify(data.details ?? {}),
      })
      .returning("*");

    if (data.correlationId) {
      await this.db()("security_event_correlations")
        .where({ id: data.correlationId })
        .increment("event_count", 1);
    }

    return this.formatEvent(eventRow);
  }

  async listSecurityEvents(filters?: {
    correlationId?: string;
    eventType?: string;
    source?: string;
    severity?: string;
    actor?: string;
    limit?: number;
  }) {
    let query = this.db()("security_events");

    if (filters?.correlationId) {
      query = query.where("correlation_id", filters.correlationId);
    }
    if (filters?.eventType) {
      query = query.where("event_type", filters.eventType);
    }
    if (filters?.source) {
      query = query.where("source", filters.source);
    }
    if (filters?.severity) {
      query = query.where("severity", filters.severity);
    }
    if (filters?.actor) {
      query = query.where("actor", filters.actor);
    }

    const rows = await query
      .orderBy("timestamp", "desc")
      .limit(filters?.limit ?? 100);

    return rows.map(this.formatEvent);
  }

  private formatCorrelation(row: any) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      severity: row.severity,
      status: row.status,
      correlationRule: typeof row.correlation_rule === "string" ? JSON.parse(row.correlation_rule) : row.correlation_rule,
      eventCount: row.event_count,
      sourceSystems: typeof row.source_systems === "string" ? JSON.parse(row.source_systems) : row.source_systems,
      timeWindowMinutes: row.time_window_minutes,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatEvent(row: any) {
    return {
      id: row.id,
      correlationId: row.correlation_id,
      eventType: row.event_type,
      source: row.source,
      severity: row.severity,
      actor: row.actor,
      ipAddress: row.ip_address,
      details: typeof row.details === "string" ? JSON.parse(row.details) : row.details,
      timestamp: row.timestamp,
    };
  }
}

export const securityEventCorrelationService = new SecurityEventCorrelationService();
