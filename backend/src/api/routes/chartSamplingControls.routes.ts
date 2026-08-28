import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import {
  chartSamplingControlsService,
  type ChartDataPoint,
  type SamplingStrategy,
} from "../../services/chartSamplingControls.service.js";
import { logger } from "../../utils/logger.js";

const VALID_STRATEGIES: SamplingStrategy[] = ["lttb", "fixed_interval", "min_max", "nth_point"];

/**
 * Chart data sampling controls routes (#1151).
 *
 * Registered at prefix: /api/v1/chart-sampling
 */
export async function chartSamplingControlsRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:sampling"] });

  // POST /sample  — one-off downsample of a provided series
  server.post<{
    Body: {
      points?: ChartDataPoint[];
      strategy?: SamplingStrategy;
      maxPoints?: number;
      profile?: string;
    };
  }>("/sample", async (request, reply) => {
    try {
      const { points, strategy, maxPoints, profile } = request.body ?? {};
      if (!Array.isArray(points)) {
        return reply.code(400).send({ error: "points must be an array of { timestamp, value }" });
      }
      if (strategy && !VALID_STRATEGIES.includes(strategy)) {
        return reply.code(400).send({
          error: `strategy must be one of: ${VALID_STRATEGIES.join(", ")}`,
        });
      }

      const sampled = profile
        ? await chartSamplingControlsService.sampleWithProfile(profile, points)
        : chartSamplingControlsService.sampleSeries(points, { strategy, maxPoints });

      return reply.code(200).send({
        originalCount: points.length,
        sampledCount: sampled.length,
        points: sampled,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404 : 400;
      return reply.code(status).send({ error: message });
    }
  });

  // GET /profiles  — list saved sampling profiles
  server.get("/profiles", async (_request, reply) => {
    const profiles = await chartSamplingControlsService.listProfiles();
    return reply.code(200).send({ profiles });
  });

  // POST /profiles  — create a saved sampling profile (admin only)
  server.post<{
    Body: {
      name?: string;
      description?: string;
      strategy?: SamplingStrategy;
      maxPoints?: number;
      minIntervalSeconds?: number;
    };
  }>("/profiles", { preHandler: requireAdmin }, async (request, reply) => {
    const actorId = request.tenantContext?.actorId ?? "unknown";
    try {
      const body = request.body ?? {};
      if (!body.name) {
        return reply.code(400).send({ error: "name is required" });
      }
      const profile = await chartSamplingControlsService.createProfile({
        name: body.name,
        description: body.description,
        strategy: body.strategy,
        maxPoints: body.maxPoints,
        minIntervalSeconds: body.minIntervalSeconds,
        createdBy: actorId,
      });
      return reply.code(201).send({ profile });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Failed to create chart sampling profile");
      return reply.code(400).send({ error: message });
    }
  });

  // DELETE /profiles/:id  — remove a saved sampling profile (admin only)
  server.delete<{ Params: { id: string } }>(
    "/profiles/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const deleted = await chartSamplingControlsService.deleteProfile(request.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: "Sampling profile not found" });
      }
      return reply.code(204).send();
    }
  );
}
