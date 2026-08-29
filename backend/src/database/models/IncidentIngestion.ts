import { Knex } from "knex";

export interface ThirdPartyIncident {
  id: string;
  source: string;
  external_id: string;
  title: string;
  description?: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  severity: "minor" | "major" | "critical";
  affected_component?: string;
  incident_started_at: Date;
  incident_resolved_at?: Date;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface IncidentStatusUpdate {
  id: string;
  incident_id: string;
  status: string;
  message?: string;
  update_timestamp: Date;
  created_at: Date;
}

export interface IncidentIngestionSource {
  id: string;
  source_name: string;
  source_type: "statuspage" | "pagerduty" | "custom_api";
  api_endpoint: string;
  auth_type: "api_key" | "oauth" | "basic";
  credentials_encrypted?: string;
  is_active: boolean;
  poll_interval_seconds: number;
  last_poll_at?: Date;
  last_success_at?: Date;
  last_error?: string;
  config: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export class IncidentIngestionModel {
  constructor(private db: Knex) {}

  async createIncident(
    incident: Omit<ThirdPartyIncident, "id" | "created_at" | "updated_at">,
  ): Promise<ThirdPartyIncident> {
    const [created] = await this.db("third_party_incidents")
      .insert(incident)
      .returning("*");
    return created;
  }

  async updateIncident(
    id: string,
    updates: Partial<ThirdPartyIncident>,
  ): Promise<ThirdPartyIncident> {
    const [updated] = await this.db("third_party_incidents")
      .where({ id })
      .update({ ...updates, updated_at: new Date() })
      .returning("*");
    return updated;
  }

  async getIncidentByExternalId(
    source: string,
    externalId: string,
  ): Promise<ThirdPartyIncident | undefined> {
    return await this.db("third_party_incidents")
      .where({ source, external_id: externalId })
      .first();
  }

  async getActiveIncidents(): Promise<ThirdPartyIncident[]> {
    return await this.db("third_party_incidents")
      .whereNot({ status: "resolved" })
      .orderBy("incident_started_at", "desc");
  }

  async addStatusUpdate(
    update: Omit<IncidentStatusUpdate, "id" | "created_at">,
  ): Promise<IncidentStatusUpdate> {
    const [created] = await this.db("incident_status_updates")
      .insert(update)
      .returning("*");
    return created;
  }

  async getIncidentUpdates(
    incidentId: string,
  ): Promise<IncidentStatusUpdate[]> {
    return await this.db("incident_status_updates")
      .where({ incident_id: incidentId })
      .orderBy("update_timestamp", "desc");
  }

  async createSource(
    source: Omit<IncidentIngestionSource, "id" | "created_at" | "updated_at">,
  ): Promise<IncidentIngestionSource> {
    const [created] = await this.db("incident_ingestion_sources")
      .insert(source)
      .returning("*");
    return created;
  }

  async updateSource(
    id: string,
    updates: Partial<IncidentIngestionSource>,
  ): Promise<IncidentIngestionSource> {
    const [updated] = await this.db("incident_ingestion_sources")
      .where({ id })
      .update({ ...updates, updated_at: new Date() })
      .returning("*");
    return updated;
  }

  async getActiveSources(): Promise<IncidentIngestionSource[]> {
    return await this.db("incident_ingestion_sources").where({
      is_active: true,
    });
  }
}
