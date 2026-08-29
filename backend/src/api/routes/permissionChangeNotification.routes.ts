import type { FastifyInstance } from "fastify";
import {
  permissionChangeNotificationService,
  type PermissionAction,
  type NotificationChannel,
  type NotificationStatus,
} from "../../services/permissionChangeNotification.service.js";
import { sendApiError } from "../utils/response.js";
import { authMiddleware } from "../middleware/auth.js";

interface CreateNotificationBody {
  targetUserId: string;
  actorId?: string;
  action: PermissionAction;
  permissionOrRole: string;
  channels?: NotificationChannel[];
  details?: Record<string, unknown>;
}

export async function permissionChangeNotificationRoutes(server: FastifyInstance) {
  const requireAuth = authMiddleware();

  // Create & dispatch permission change notification
  server.post<{ Body: CreateNotificationBody }>(
    "/",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { targetUserId, actorId, action, permissionOrRole, channels, details } =
        request.body;

      if (!targetUserId?.trim() || !action || !permissionOrRole?.trim()) {
        return sendApiError(
          reply,
          400,
          "targetUserId, action, and permissionOrRole are required"
        );
      }

      try {
        const notification = await permissionChangeNotificationService.notify({
          targetUserId,
          actorId: actorId ?? request.apiKeyAuth?.name ?? "system",
          action,
          permissionOrRole,
          channels,
          details,
        });
        return reply.code(201).send({ notification });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Notification dispatch failed";
        return sendApiError(reply, 400, message);
      }
    }
  );

  // List notifications for a user
  server.get<{
    Querystring: {
      targetUserId?: string;
      status?: NotificationStatus;
      unreadOnly?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    "/",
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.query.targetUserId ?? request.apiKeyAuth?.name ?? "default_user";

      if (!userId) {
        return sendApiError(reply, 400, "targetUserId is required");
      }

      const notifications =
        await permissionChangeNotificationService.listUserNotifications(userId, {
          status: request.query.status,
          unreadOnly: request.query.unreadOnly === "true",
          limit: request.query.limit ? Number(request.query.limit) : undefined,
          offset: request.query.offset ? Number(request.query.offset) : undefined,
        });

      return { notifications };
    }
  );

  // Mark notification as read
  server.patch<{ Params: { id: string }; Body: { targetUserId?: string } }>(
    "/:id/read",
    { preHandler: requireAuth },
    async (request, reply) => {
      const userId = request.body?.targetUserId ?? request.apiKeyAuth?.name ?? "default_user";
      const notification = await permissionChangeNotificationService.markAsRead(
        request.params.id,
        userId
      );

      if (!notification) {
        return sendApiError(reply, 404, "Notification not found or already read");
      }

      return { notification };
    }
  );

  // Get notification stats
  server.get(
    "/stats",
    { preHandler: requireAuth },
    async () => {
      const stats = await permissionChangeNotificationService.getStats();
      return { stats };
    }
  );
}
