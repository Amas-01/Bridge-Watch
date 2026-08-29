import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type ImpersonationStatus = "ACTIVE" | "ENDED" | "REVOKED" | "EXPIRED";

export interface AdminImpersonationSession {
  id: string;
  adminId: string;
  impersonatedUserId: string;
  reason: string;
  approvalTicketId: string | null;
  status: ImpersonationStatus;
  tokenHash: string;
  maxDurationMinutes: number;
  expiresAt: string;
  endedAt: string | null;
  ipAddress: string;
  createdAt: string;
  updatedAt: string;
}

export interface ImpersonationAuditLog {
  id: string;
  impersonationSessionId: string;
  adminId: string;
  impersonatedUserId: string;
  actionPerformed: string;
  requestPath: string;
  requestMethod: string;
  timestamp: string;
}

interface Row {
  [key: string]: unknown;
}

export class AdminImpersonationService {
  async startSession(input: {
    adminId: string;
    impersonatedUserId: string;
    reason: string;
    approvalTicketId?: string;
    durationMinutes?: number;
    ipAddress: string;
  }): Promise<{ session: AdminImpersonationSession; token: string }> {
    const db = getDatabase();

    if (!input.adminId?.trim() || !input.impersonatedUserId?.trim()) {
      throw new Error("adminId and impersonatedUserId are required");
    }
    if (!input.reason?.trim()) {
      throw new Error("Reason / ticket justification is mandatory for impersonation");
    }
    if (input.adminId.trim() === input.impersonatedUserId.trim()) {
      throw new Error("Admin cannot impersonate themselves");
    }

    const duration = Math.min(Math.max(input.durationMinutes ?? 30, 5), 120);
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const [inserted] = await db("admin_impersonation_sessions")
      .insert({
        admin_id: input.adminId.trim(),
        impersonated_user_id: input.impersonatedUserId.trim(),
        reason: input.reason.trim(),
        approval_ticket_id: input.approvalTicketId?.trim() ?? null,
        status: "ACTIVE",
        token_hash: tokenHash,
        max_duration_minutes: duration,
        expires_at: expiresAt,
        ip_address: input.ipAddress.trim(),
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.warn(
      {
        feature: "admin_impersonation_safeguards",
        action: "impersonation_started",
        admin_id: input.adminId,
        impersonated_user_id: input.impersonatedUserId,
        approval_ticket_id: input.approvalTicketId ?? null,
        expires_at: expiresAt,
      },
      "Admin impersonation session created"
    );

    return {
      session: this.mapSessionRow(inserted as Row),
      token: rawToken,
    };
  }

  async validateAndTouchSession(
    sessionId: string,
    token: string
  ): Promise<AdminImpersonationSession | null> {
    const db = getDatabase();
    const sessionRow = (await db("admin_impersonation_sessions")
      .where({ id: sessionId })
      .first()) as Row | undefined;

    if (!sessionRow) return null;

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    if (sessionRow.token_hash !== tokenHash) {
      return null;
    }

    const now = new Date();
    if (sessionRow.status !== "ACTIVE" || new Date(String(sessionRow.expires_at)) < now) {
      if (sessionRow.status === "ACTIVE") {
        await db("admin_impersonation_sessions")
          .where({ id: sessionId })
          .update({ status: "EXPIRED", updated_at: now });
      }
      return null;
    }

    return this.mapSessionRow(sessionRow);
  }

  async logAction(input: {
    impersonationSessionId: string;
    adminId: string;
    impersonatedUserId: string;
    actionPerformed: string;
    requestPath: string;
    requestMethod: string;
  }): Promise<ImpersonationAuditLog> {
    const db = getDatabase();
    const [inserted] = await db("admin_impersonation_audit_logs")
      .insert({
        impersonation_session_id: input.impersonationSessionId,
        admin_id: input.adminId,
        impersonated_user_id: input.impersonatedUserId,
        action_performed: input.actionPerformed,
        request_path: input.requestPath,
        request_method: input.requestMethod,
        timestamp: new Date(),
      })
      .returning("*");

    return this.mapAuditRow(inserted as Row);
  }

  async endSession(
    sessionId: string,
    adminId: string
  ): Promise<AdminImpersonationSession | null> {
    const db = getDatabase();
    const [updated] = await db("admin_impersonation_sessions")
      .where({ id: sessionId, admin_id: adminId })
      .update({
        status: "ENDED",
        ended_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    if (updated) {
      logger.info(
        {
          feature: "admin_impersonation_safeguards",
          action: "impersonation_ended",
          session_id: sessionId,
          admin_id: adminId,
        },
        "Admin impersonation session ended"
      );
    }

    return updated ? this.mapSessionRow(updated as Row) : null;
  }

  async listSessions(filters?: {
    adminId?: string;
    impersonatedUserId?: string;
    status?: ImpersonationStatus;
    limit?: number;
    offset?: number;
  }): Promise<AdminImpersonationSession[]> {
    const db = getDatabase();
    const rows = (await db("admin_impersonation_sessions")
      .modify((qb) => {
        if (filters?.adminId) {
          qb.where("admin_id", filters.adminId);
        }
        if (filters?.impersonatedUserId) {
          qb.where("impersonated_user_id", filters.impersonatedUserId);
        }
        if (filters?.status) {
          qb.where("status", filters.status);
        }
      })
      .orderBy("created_at", "desc")
      .limit(filters?.limit ?? 50)
      .offset(filters?.offset ?? 0)) as Row[];

    return rows.map((r) => this.mapSessionRow(r));
  }

  async getAuditLogs(sessionId: string): Promise<ImpersonationAuditLog[]> {
    const db = getDatabase();
    const rows = (await db("admin_impersonation_audit_logs")
      .where({ impersonation_session_id: sessionId })
      .orderBy("timestamp", "desc")) as Row[];

    return rows.map((r) => this.mapAuditRow(r));
  }

  private mapSessionRow(row: Row): AdminImpersonationSession {
    return {
      id: String(row.id),
      adminId: String(row.admin_id),
      impersonatedUserId: String(row.impersonated_user_id),
      reason: String(row.reason),
      approvalTicketId: row.approval_ticket_id ? String(row.approval_ticket_id) : null,
      status: String(row.status) as ImpersonationStatus,
      tokenHash: String(row.token_hash),
      maxDurationMinutes: Number(row.max_duration_minutes),
      expiresAt: String(row.expires_at),
      endedAt: row.ended_at ? String(row.ended_at) : null,
      ipAddress: String(row.ip_address),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapAuditRow(row: Row): ImpersonationAuditLog {
    return {
      id: String(row.id),
      impersonationSessionId: String(row.impersonation_session_id),
      adminId: String(row.admin_id),
      impersonatedUserId: String(row.impersonated_user_id),
      actionPerformed: String(row.action_performed),
      requestPath: String(row.request_path),
      requestMethod: String(row.request_method),
      timestamp: String(row.timestamp),
    };
  }
}

export const adminImpersonationService = new AdminImpersonationService();
