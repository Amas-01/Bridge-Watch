import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { NotificationAnalyticsService } from "../../services/notificationAnalytics.service.js";
import { authMiddleware } from "../middleware/auth.js";

export async function notificationAnalyticsRoutes(server: FastifyInstance) {
  const service = new NotificationAnalyticsService();

  server.addHook("preHandler", authMiddleware());

  server.get<{
    Querystring: {
      startDate: string;
      endDate: string;
      notificationType?: string;
    };
  }>(
    "/analytics",
    {
      schema: {
        tags: ["Notification Analytics"],
        summary: "Get notification delivery analytics",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          required: ["startDate", "endDate"],
          properties: {
            startDate: { type: "string", format: "date-time" },
            endDate: { type: "string", format: "date-time" },
            notificationType: { type: "string" },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { startDate, endDate, notificationType } = request.query as {
        startDate: string;
        endDate: string;
        notificationType?: string;
      };
      const analytics = await service.getAnalytics(new Date(startDate), new Date(endDate), notificationType);
      reply.send(analytics);
    }
  );

  server.get<{ Querystring: { channel: string; limit?: string } }>(
    "/history",
    {
      schema: {
        tags: ["Notification Analytics"],
        summary: "Get notification delivery history",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          required: ["channel"],
          properties: {
            channel: { type: "string" },
            limit: { type: "string" },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { channel, limit } = request.query as { channel: string; limit?: string };
      const history = await service.getDeliveryHistory(channel, limit ? parseInt(limit) : 100);
      reply.send({ history });
    }
  );

  server.post<{
    Body: {
      notificationType: string;
      channel: string;
      recipient: string;
      status: string;
      deliveryTimeMs?: number;
      errorMessage?: string;
      metadata?: Record<string, unknown>;
    };
  }>(
    "/log",
    {
      schema: {
        tags: ["Notification Analytics"],
        summary: "Log notification delivery",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["notificationType", "channel", "recipient", "status"],
          properties: {
            notificationType: { type: "string" },
            channel: { type: "string" },
            recipient: { type: "string" },
            status: { type: "string", enum: ["sent", "delivered", "failed", "bounced"] },
            deliveryTimeMs: { type: "number" },
            errorMessage: { type: "string" },
            metadata: { type: "object" },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { notificationType, channel, recipient, status, deliveryTimeMs, errorMessage, metadata } = request.body;
      const delivery = await service.logDelivery(
        notificationType,
        channel,
        recipient,
        status as any,
        deliveryTimeMs,
        errorMessage,
        metadata
      );
      reply.code(201).send({ delivery });
    }
  );
}
