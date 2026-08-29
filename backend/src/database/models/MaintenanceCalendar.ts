import { Knex } from "knex";

export interface DataSource {
  id: string;
  source_name: string;
  source_type: "api" | "rpc" | "oracle" | "bridge";
  status: string;
  description?: string;
  config: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface MaintenanceWindow {
  id: string;
  data_source_id: string;
  title: string;
  description?: string;
  scheduled_start: Date;
  scheduled_end: Date;
  actual_start?: Date;
  actual_end?: Date;
  status: "scheduled" | "in_progress" | "completed" | "cancelled";
  impact_level: "none" | "low" | "medium" | "high";
  notify_users: boolean;
  created_by?: string;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface MaintenanceNotification {
  id: string;
  maintenance_window_id: string;
  notification_type: "email" | "webhook" | "in_app";
  scheduled_send_at: Date;
  sent_at?: Date;
  status: string;
  error_message?: string;
  recipients?: Record<string, any>;
  created_at: Date;
}

export class MaintenanceCalendarModel {
  constructor(private db: Knex) {}

  async createDataSource(
    source: Omit<DataSource, "id" | "created_at" | "updated_at">,
  ): Promise<DataSource> {
    const [created] = await this.db("data_sources")
      .insert(source)
      .returning("*");
    return created;
  }

  async getAllDataSources(): Promise<DataSource[]> {
    return await this.db("data_sources").select("*");
  }

  async getDataSourceById(id: string): Promise<DataSource | undefined> {
    return await this.db("data_sources").where({ id }).first();
  }

  async createMaintenanceWindow(
    window: Omit<MaintenanceWindow, "id" | "created_at" | "updated_at">,
  ): Promise<MaintenanceWindow> {
    const [created] = await this.db("maintenance_windows")
      .insert(window)
      .returning("*");
    return created;
  }

  async updateMaintenanceWindow(
    id: string,
    updates: Partial<MaintenanceWindow>,
  ): Promise<MaintenanceWindow> {
    const [updated] = await this.db("maintenance_windows")
      .where({ id })
      .update({ ...updates, updated_at: new Date() })
      .returning("*");
    return updated;
  }

  async getUpcomingMaintenance(days: number = 7): Promise<MaintenanceWindow[]> {
    const now = new Date();
    const future = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    return await this.db("maintenance_windows")
      .where("scheduled_start", ">=", now)
      .where("scheduled_start", "<=", future)
      .whereIn("status", ["scheduled", "in_progress"])
      .orderBy("scheduled_start", "asc");
  }

  async getMaintenanceByDataSource(
    dataSourceId: string,
  ): Promise<MaintenanceWindow[]> {
    return await this.db("maintenance_windows")
      .where({ data_source_id: dataSourceId })
      .orderBy("scheduled_start", "desc");
  }

  async createNotification(
    notification: Omit<MaintenanceNotification, "id" | "created_at">,
  ): Promise<MaintenanceNotification> {
    const [created] = await this.db("maintenance_notifications")
      .insert(notification)
      .returning("*");
    return created;
  }

  async getPendingNotifications(): Promise<MaintenanceNotification[]> {
    const now = new Date();
    return await this.db("maintenance_notifications")
      .where({ status: "pending" })
      .where("scheduled_send_at", "<=", now)
      .orderBy("scheduled_send_at", "asc");
  }

  async markNotificationSent(id: string): Promise<void> {
    await this.db("maintenance_notifications")
      .where({ id })
      .update({ status: "sent", sent_at: new Date() });
  }
}
