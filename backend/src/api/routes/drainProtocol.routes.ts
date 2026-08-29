import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { drainProtocolService } from "../../services/drainProtocol.service.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendApiError } from "../utils/response.js";

const startDrainSchema = z.object({
  nodeId: z.string().optional(),
  timeoutSeconds: z.number().int().min(1).max(300).optional(),
  reason: z.string().optional(),
  initiatedBy: z.string().optional(),
  mode: z.enum(["graceful", "force", "read_only"]).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const cancelDrainSchema = z.object({
  cancelledBy: z.string().optional(),
});

const forceDrainSchema = z.object({
  reason: z.string().optional(),
});

export async function drainProtocolRoutes(server: FastifyInstance): Promise<void> {
  const adminAuth = authMiddleware({ requiredScopes: ["admin:write"] });

  // Start graceful shutdown drain protocol
  server.post("/start", { preHandler: [adminAuth] }, async (request, reply) => {
    const parsed = startDrainSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return sendApiError(reply, 400, "Invalid drain options", { issues: parsed.error.errors });
    }

    const status = await drainProtocolService.startDrain(parsed.data);
    return reply.status(202).send(status);
  });

  // Get current drain status
  server.get("/status", async (_request, reply) => {
    const status = drainProtocolService.getStatus();
    return reply.status(200).send(status);
  });

  // Cancel drain and resume normal operation
  server.post("/cancel", { preHandler: [adminAuth] }, async (request, reply) => {
    const parsed = cancelDrainSchema.safeParse(request.body || {});
    const cancelledBy = parsed.success ? parsed.data.cancelledBy || "admin" : "admin";
    const status = await drainProtocolService.cancelDrain(cancelledBy);
    return reply.status(200).send(status);
  });

  // Force immediate shutdown
  server.post("/force", { preHandler: [adminAuth] }, async (request, reply) => {
    const parsed = forceDrainSchema.safeParse(request.body || {});
    const reason = parsed.success ? parsed.data.reason || "Force shutdown requested" : "Force shutdown requested";
    const status = await drainProtocolService.forceShutdown(reason);
    return reply.status(200).send(status);
  });

  // Get drain history
  server.get("/history", { preHandler: [adminAuth] }, async (request, reply) => {
    const limit = Number((request.query as { limit?: string })?.limit) || 20;
    const history = await drainProtocolService.getDrainHistory(limit);
    return reply.status(200).send({ history, count: history.length });
  });
}
