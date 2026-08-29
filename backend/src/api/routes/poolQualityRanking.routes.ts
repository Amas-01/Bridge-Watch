import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import {
  poolQualityRankingService,
  QUALITY_WEIGHTS,
} from "../../services/poolQualityRanking.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Liquidity Pool Quality Ranking API (#1158).
 *
 * Mounted at `/api/v1/liquidity/pool-quality`.
 *
 *   GET  /ranking             the latest ranking batch
 *   GET  /weights             the component weights behind a score
 *   GET  /pools/:poolKey      score history for one pool
 *   POST /recompute           score every pool now  (admin:config)
 */

const rankingQuerySchema = z.object({
  dex: z.string().trim().min(1).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const recomputeBodySchema = z.object({
  dex: z.string().trim().min(1).max(60).optional(),
});

export async function poolQualityRankingRoutes(server: FastifyInstance) {
  const requireRead = authMiddleware();
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:config"] });

  server.get(
    "/ranking",
    { preHandler: requireRead } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = rankingQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid query", details: parsed.error.issues });
      }

      const ranking = await poolQualityRankingService.getLatestRanking(parsed.data);
      return reply.send({
        ranking,
        total: ranking.length,
        computedAt: ranking[0]?.computedAt ?? null,
      });
    }
  );

  server.get("/weights", { preHandler: requireRead } as never, async () => ({
    weights: QUALITY_WEIGHTS,
  }));

  server.get(
    "/pools/:poolKey",
    { preHandler: requireRead } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { poolKey } = request.params as { poolKey: string };
      const { limit } = request.query as { limit?: string };

      const history = await poolQualityRankingService.getPoolHistory(
        poolKey,
        limit ? Number(limit) : undefined
      );
      if (history.length === 0) {
        return reply.status(404).send({ error: `No scores recorded for ${poolKey}` });
      }
      return reply.send({ poolKey, current: history[0], history });
    }
  );

  server.post(
    "/recompute",
    { preHandler: requireAdmin } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = recomputeBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid body", details: parsed.error.issues });
      }

      try {
        const ranking = await poolQualityRankingService.computeRanking(parsed.data);
        return reply.send({ ranking, total: ranking.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ranking failed";
        logger.error({ error }, "Pool quality ranking recompute failed");
        return reply.status(500).send({ error: message });
      }
    }
  );
}
