import type { FastifyInstance } from "fastify";
import {
  adminImpersonationService,
  type ImpersonationStatus,
} from "../../services/adminImpersonation.service.js";
import { sendApiError } from "../utils/response.js";
import { authMiddleware } from "../middleware/auth.js";

interface StartImpersonationBody {
  adminId?: string;
  impersonatedUserId: string;
  reason: string;
  approvalTicketId?: string;
  durationMinutes?: number;
}

interface StopImpersonationBody {
  sessionId: string;
  adminId?: string;
}

export async function adminImpersonationRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:access"] });

  // Start impersonation session
  server.post<{ Body: StartImpersonationBody }>(
    "/start",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { adminId, impersonatedUserId, reason, approvalTicketId, durationMinutes } =
        request.body;

      const resolvedAdminId = adminId ?? request.apiKeyAuth?.name ?? "admin";
      const ipAddress = request.ip ?? "127.0.0.1";

      if (!impersonatedUserId?.trim()) {
        return sendApiError(reply, 400, "impersonatedUserId is required");
      }
      if (!reason?.trim()) {
        return sendApiError(
          reply,
          400,
          "Mandatory justification reason is required for admin impersonation"
        );
      }

      try {
        const result = await adminImpersonationService.startSession({
          adminId: resolvedAdminId,
          impersonatedUserId,
          reason,
          approvalTicketId,
          durationMinutes,
          ipAddress,
        });

        return reply.code(201).send(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to start impersonation";
        return sendApiError(reply, 400, message);
      }
    }
  );

  // Stop impersonation session
  server.post<{ Body: StopImpersonationBody }>(
    "/stop",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { sessionId, adminId } = request.body;
      const resolvedAdminId = adminId ?? request.apiKeyAuth?.name ?? "admin";

      if (!sessionId?.trim()) {
        return sendApiError(reply, 400, "sessionId is required");
      }

      const session = await adminImpersonationService.endSession(
        sessionId,
        resolvedAdminId
      );

      if (!session) {
        return sendApiError(reply, 404, "Active impersonation session not found");
      }

      return { session };
    }
  );

  // List impersonation sessions
  server.get<{
    Querystring: {
      adminId?: string;
      impersonatedUserId?: string;
      status?: ImpersonationStatus;
      limit?: string;
      offset?: string;
    };
  }>(
    "/sessions",
    { preHandler: requireAdmin },
    async (request) => {
      const sessions = await adminImpersonationService.listSessions({
        adminId: request.query.adminId,
        impersonatedUserId: request.query.impersonatedUserId,
        status: request.query.status,
        limit: request.query.limit ? Number(request.query.limit) : undefined,
        offset: request.query.offset ? Number(request.query.offset) : undefined,
      });

      return { sessions };
    }
  );

  // Get audit logs for session
  server.get<{ Querystring: { sessionId: string } }>(
    "/audit-logs",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { sessionId } = request.query;

      if (!sessionId?.trim()) {
        return sendApiError(reply, 400, "sessionId is required");
      }

      const auditLogs = await adminImpersonationService.getAuditLogs(sessionId);
      return { auditLogs };
    }
  );
}
