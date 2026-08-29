import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type PermissionAction =
  | "ROLE_ASSIGNED"
  | "ROLE_REVOKED"
  | "PERMISSION_GRANTED"
  | "PERMISSION_REVOKED";

export type NotificationChannel = "IN_APP" | "EMAIL" | "SLACK";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED";

export interface PermissionChangeNotificationRecord {
  id: string;
  targetUserId: string;
  actorId: string;
  action: PermissionAction;
  permissionOrRole: string;
  channels: NotificationChannel[];
  status: NotificationStatus;
  details: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PermissionNotificationStats {
  total: number;
  byStatus: Record<NotificationStatus, number>;
  byAction: Record<PermissionAction, number>;
}

interface Row {
  [key: string]: unknown;
}

export class PermissionChangeNotificationService {
  async notify(input: {
    targetUserId: string;
    actorId: string;
    action: PermissionAction;
    permissionOrRole: string;
    channels?: NotificationChannel[];
    details?: Record<string, unknown>;
  }): Promise<PermissionChangeNotificationRecord> {
    const db = getDatabase();

    if (!input.targetUserId?.trim() || !input.actorId?.trim()) {
      throw new Error("targetUserId and actorId are required");
    }
    if (!input.action?.trim() || !input.permissionOrRole?.trim()) {
      throw new Error("action and permissionOrRole are required");
    }

    const channels = input.channels && input.channels.length > 0 ? input.channels : ["IN_APP"];

    const [inserted] = await db("permission_change_notifications")
      .insert({
        target_user_id: input.targetUserId.trim(),
        actor_id: input.actorId.trim(),
        action: input.action,
        permission_or_role: input.permissionOrRole.trim(),
        channels: JSON.stringify(channels),
        status: "SENT",
        details: JSON.stringify(input.details ?? {}),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "permission_change_notifications",
        action: "notification_created",
        target_user_id: input.targetUserId,
        actor_id: input.actorId,
        permission_or_role: input.permissionOrRole,
      },
      "Permission change notification created and dispatched"
    );

    return this.mapRow(inserted as Row);
  }

  async listUserNotifications(
    targetUserId: string,
    filters?: {
      status?: NotificationStatus;
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    }
  ): Promise<PermissionChangeNotificationRecord[]> {
    const db = getDatabase();
    const rows = (await db("permission_change_notifications")
      .where("target_user_id", targetUserId)
      .modify((qb) => {
        if (filters?.status) {
          qb.where("status", filters.status);
        }
        if (filters?.unreadOnly) {
          qb.whereNull("read_at");
        }
      })
      .orderBy("created_at", "desc")
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0)) as Row[];

    return rows.map((row) => this.mapRow(row));
  }

  async markAsRead(
    id: string,
    targetUserId: string
  ): Promise<PermissionChangeNotificationRecord | null> {
    const db = getDatabase();
    const [updated] = await db("permission_change_notifications")
      .where({ id, target_user_id: targetUserId })
      .update({
        read_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    return updated ? this.mapRow(updated as Row) : null;
  }

  async getStats(): Promise<PermissionNotificationStats> {
    const db = getDatabase();
    const statusRows = (await db("permission_change_notifications")
      .select("status")
      .select(db.raw("count(*)::int as cnt"))
      .groupBy("status")) as Row[];

    const actionRows = (await db("permission_change_notifications")
      .select("action")
      .select(db.raw("count(*)::int as cnt"))
      .groupBy("action")) as Row[];

    const byStatus: Record<NotificationStatus, number> = {
      PENDING: 0,
      SENT: 0,
      FAILED: 0,
    };

    const byAction: Record<PermissionAction, number> = {
      ROLE_ASSIGNED: 0,
      ROLE_REVOKED: 0,
      PERMISSION_GRANTED: 0,
      PERMISSION_REVOKED: 0,
    };

    let total = 0;
    for (const row of statusRows) {
      const st = String(row.status) as NotificationStatus;
      if (st in byStatus) {
        byStatus[st] = Number(row.cnt);
      }
      total += Number(row.cnt);
    }

    for (const row of actionRows) {
      const act = String(row.action) as PermissionAction;
      if (act in byAction) {
        byAction[act] = Number(row.cnt);
      }
    }

    return { total, byStatus, byAction };
  }

  private mapRow(row: Row): PermissionChangeNotificationRecord {
    return {
      id: String(row.id),
      targetUserId: String(row.target_user_id),
      actorId: String(row.actor_id),
      action: String(row.action) as PermissionAction,
      permissionOrRole: String(row.permission_or_role),
      channels: this.parseArray(row.channels) as NotificationChannel[],
      status: String(row.status) as NotificationStatus,
      details: this.parseObject(row.details),
      readAt: row.read_at ? String(row.read_at) : null,
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

  private parseArray(value: unknown): unknown[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return [];
    }
  }
}

export const permissionChangeNotificationService = new PermissionChangeNotificationService();
