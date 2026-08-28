import { Knex } from "knex";
import {
  IncidentIngestionModel,
  ThirdPartyIncident,
  IncidentIngestionSource,
} from "../database/models/IncidentIngestion.js";
import logger from "../utils/logger.js";

export class IncidentIngestionService {
  private model: IncidentIngestionModel;

  constructor(private db: Knex) {
    this.model = new IncidentIngestionModel(db);
  }

  async ingestIncident(
    source: string,
    externalIncident: any,
  ): Promise<ThirdPartyIncident> {
    const existing = await this.model.getIncidentByExternalId(
      source,
      externalIncident.id,
    );

    const incidentData = {
      source,
      external_id: externalIncident.id,
      title: externalIncident.title || externalIncident.name,
      description: externalIncident.description,
      status: this.normalizeStatus(externalIncident.status),
      severity: this.normalizeSeverity(
        externalIncident.impact || externalIncident.severity,
      ),
      affected_component: externalIncident.components?.[0] || null,
      incident_started_at: new Date(
        externalIncident.started_at || externalIncident.created_at,
      ),
      incident_resolved_at: externalIncident.resolved_at
        ? new Date(externalIncident.resolved_at)
        : null,
      metadata: externalIncident,
    };

    if (existing) {
      const updated = await this.model.updateIncident(
        existing.id,
        incidentData,
      );
      logger.info({ incidentId: updated.id }, "Updated existing incident");
      return updated;
    } else {
      const created = await this.model.createIncident(incidentData);
      logger.info({ incidentId: created.id }, "Created new incident");
      return created;
    }
  }

  async pollSource(
    sourceId: string,
  ): Promise<{ success: boolean; incidentsProcessed: number; error?: string }> {
    const sources = await this.model.getActiveSources();
    const source = sources.find((s) => s.id === sourceId);

    if (!source) {
      throw new Error(`Source ${sourceId} not found or inactive`);
    }

    try {
      const incidents = await this.fetchIncidentsFromSource(source);
      let processed = 0;

      for (const incident of incidents) {
        await this.ingestIncident(source.source_name, incident);
        processed++;
      }

      await this.model.updateSource(sourceId, {
        last_poll_at: new Date(),
        last_success_at: new Date(),
        last_error: null,
      });

      return { success: true, incidentsProcessed: processed };
    } catch (error: any) {
      await this.model.updateSource(sourceId, {
        last_poll_at: new Date(),
        last_error: error.message,
      });

      return { success: false, incidentsProcessed: 0, error: error.message };
    }
  }

  async getActiveIncidents(): Promise<ThirdPartyIncident[]> {
    return await this.model.getActiveIncidents();
  }

  private async fetchIncidentsFromSource(
    source: IncidentIngestionSource,
  ): Promise<any[]> {
    // Placeholder implementation - would integrate with actual APIs
    // StatusPage, PagerDuty, etc.
    return [];
  }

  private normalizeStatus(
    status: string,
  ): "investigating" | "identified" | "monitoring" | "resolved" {
    const normalized = status.toLowerCase();
    if (normalized.includes("investigating")) return "investigating";
    if (normalized.includes("identified")) return "identified";
    if (normalized.includes("monitoring") || normalized.includes("watching"))
      return "monitoring";
    if (normalized.includes("resolved") || normalized.includes("fixed"))
      return "resolved";
    return "investigating";
  }

  private normalizeSeverity(impact: string): "minor" | "major" | "critical" {
    const normalized = impact.toLowerCase();
    if (normalized.includes("critical") || normalized.includes("high"))
      return "critical";
    if (normalized.includes("major") || normalized.includes("medium"))
      return "major";
    return "minor";
  }
}
