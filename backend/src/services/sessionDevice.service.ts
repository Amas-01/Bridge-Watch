import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type DeviceType = "DESKTOP" | "MOBILE" | "TABLET" | "OTHER";

export interface SessionDeviceRecord {
  id: string;
  userId: string;
  deviceFingerprint: string;
  deviceName: string;
  deviceType: DeviceType;
  ipAddress: string;
  location: string | null;
  userAgent: string | null;
  isActive: boolean;
  isTrusted: boolean;
  lastActiveAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  [key: string]: unknown;
}

export class SessionDeviceService {
  async registerOrUpdateDevice(input: {
    userId: string;
    deviceFingerprint: string;
    deviceName: string;
    deviceType?: DeviceType;
    ipAddress: string;
    location?: string;
    userAgent?: string;
  }): Promise<SessionDeviceRecord> {
    const db = getDatabase();

    if (!input.userId?.trim() || !input.deviceFingerprint?.trim()) {
      throw new Error("userId and deviceFingerprint are required");
    }
    if (!input.deviceName?.trim() || !input.ipAddress?.trim()) {
      throw new Error("deviceName and ipAddress are required");
    }

    const existing = (await db("user_session_devices")
      .where({
        user_id: input.userId.trim(),
        device_fingerprint: input.deviceFingerprint.trim(),
      })
      .first()) as Row | undefined;

    if (existing) {
      const [updated] = await db("user_session_devices")
        .where({ id: String(existing.id) })
        .update({
          device_name: input.deviceName.trim(),
          device_type: input.deviceType ?? existing.device_type,
          ip_address: input.ipAddress.trim(),
          location: input.location ?? existing.location,
          user_agent: input.userAgent ?? existing.user_agent,
          is_active: true,
          revoked_at: null,
          last_active_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*");

      return this.mapRow(updated as Row);
    }

    const [inserted] = await db("user_session_devices")
      .insert({
        user_id: input.userId.trim(),
        device_fingerprint: input.deviceFingerprint.trim(),
        device_name: input.deviceName.trim(),
        device_type: input.deviceType ?? "DESKTOP",
        ip_address: input.ipAddress.trim(),
        location: input.location ?? null,
        user_agent: input.userAgent ?? null,
        is_active: true,
        is_trusted: false,
        last_active_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "session_device_management",
        action: "device_registered",
        user_id: input.userId,
        device_fingerprint: input.deviceFingerprint,
      },
      "New session device registered"
    );

    return this.mapRow(inserted as Row);
  }

  async getUserDevices(userId: string): Promise<SessionDeviceRecord[]> {
    const db = getDatabase();
    const rows = (await db("user_session_devices")
      .where({ user_id: userId })
      .orderBy("last_active_at", "desc")) as Row[];

    return rows.map((row) => this.mapRow(row));
  }

  async revokeDevice(
    userId: string,
    deviceId: string
  ): Promise<SessionDeviceRecord | null> {
    const db = getDatabase();
    const [updated] = await db("user_session_devices")
      .where({ id: deviceId, user_id: userId })
      .update({
        is_active: false,
        revoked_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    if (updated) {
      logger.info(
        {
          feature: "session_device_management",
          action: "device_revoked",
          user_id: userId,
          device_id: deviceId,
        },
        "User device session revoked"
      );
    }

    return updated ? this.mapRow(updated as Row) : null;
  }

  async revokeOtherDevices(
    userId: string,
    currentDeviceId: string
  ): Promise<number> {
    const db = getDatabase();
    const updatedCount = await db("user_session_devices")
      .where("user_id", userId)
      .whereNot("id", currentDeviceId)
      .where("is_active", true)
      .update({
        is_active: false,
        revoked_at: new Date(),
        updated_at: new Date(),
      });

    logger.info(
      {
        feature: "session_device_management",
        action: "other_devices_revoked",
        user_id: userId,
        revoked_count: updatedCount,
      },
      "Revoked all other active session devices for user"
    );

    return updatedCount;
  }

  async setTrustStatus(
    userId: string,
    deviceId: string,
    isTrusted: boolean
  ): Promise<SessionDeviceRecord | null> {
    const db = getDatabase();
    const [updated] = await db("user_session_devices")
      .where({ id: deviceId, user_id: userId })
      .update({
        is_trusted: isTrusted,
        updated_at: new Date(),
      })
      .returning("*");

    return updated ? this.mapRow(updated as Row) : null;
  }

  private mapRow(row: Row): SessionDeviceRecord {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      deviceFingerprint: String(row.device_fingerprint),
      deviceName: String(row.device_name),
      deviceType: String(row.device_type) as DeviceType,
      ipAddress: String(row.ip_address),
      location: row.location ? String(row.location) : null,
      userAgent: row.user_agent ? String(row.user_agent) : null,
      isActive: Boolean(row.is_active),
      isTrusted: Boolean(row.is_trusted),
      lastActiveAt: String(row.last_active_at),
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}

export const sessionDeviceService = new SessionDeviceService();
