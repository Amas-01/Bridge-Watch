import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { ingestionWatermarkCoordinator } from "../../services/ingestionWatermarkCoordinator.service.js";

const overrideSchema = z.object({ source: z.string().min(1), allowThrough: z.number().int().nonnegative(), reason: z.string().min(3).max(500), expiresAt: z.string().datetime().optional() });
export async function ingestionWatermarkRoutes(server: FastifyInstance) {
  const ops = authMiddleware({ requiredScopes: ["admin:config"] });
  server.get<{ Params: { consumer: string } }>("/:consumer", { preHandler: ops }, async (request) => ({ window: await ingestionWatermarkCoordinator.inspect(request.params.consumer) }));
  server.post<{ Params: { consumer: string }; Body: unknown }>("/:consumer/overrides", { preHandler: ops }, async (request) => { const body = overrideSchema.parse(request.body); await ingestionWatermarkCoordinator.overrideBarrier({ consumer: request.params.consumer, source: body.source, allowThrough: body.allowThrough, reason: body.reason, expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined, actorId: request.apiKeyAuth?.id ?? "admin" }); return { ok: true }; });
}
