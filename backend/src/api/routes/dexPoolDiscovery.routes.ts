import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { dexPoolDiscoveryService } from "../../services/dexPoolDiscovery.service.js";
import { logger } from "../../utils/logger.js";

/**
 * DEX Pool Discovery Refresh API (#1157).
 *
 * Mounted at `/api/v1/liquidity/pool-discovery`.
 *
 *   GET  /pools     the pool registry (filter by DEX / status)
 *   GET  /runs      refresh history
 *   GET  /runs/latest?dex=  the most recent run for one DEX
 *   POST /refresh   reconcile one or more DEXes now  (admin:config)
 */

const listPoolsQuerySchema = z.object({
  dex: z.string().trim().min(1).max(60).optional(),
  status: z.enum(["active", "delisted"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const listRunsQuerySchema = z.object({
  dex: z.string().trim().min(1).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const refreshBodySchema = z.object({
  dexes: z.array(z.string().trim().min(1).max(60)).min(1).max(20),
});

export async function dexPoolDiscoveryRoutes(server: FastifyInstance) {
  const requireRead = authMiddleware();
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:config"] });

  server.get(
    "/pools",
    { preHandler: requireRead } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = listPoolsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid query", details: parsed.error.issues });
      }

      const pools = await dexPoolDiscoveryService.listPools(parsed.data);
      return reply.send({ pools, total: pools.length });
    }
  );

  server.get(
    "/runs",
    { preHandler: requireRead } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = listRunsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid query", details: parsed.error.issues });
      }

      const runs = await dexPoolDiscoveryService.listRuns(
        parsed.data.dex,
        parsed.data.limit
      );
      return reply.send({ runs, total: runs.length });
    }
  );

  server.get(
    "/runs/latest",
    { preHandler: requireRead } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { dex } = (request.query ?? {}) as { dex?: string };
      if (!dex) return reply.status(400).send({ error: "dex is required" });

      const run = await dexPoolDiscoveryService.getLatestRun(dex);
      if (!run) return reply.status(404).send({ error: `No discovery run for ${dex}` });
      return reply.send({ run });
    }
  );

  server.post(
    "/refresh",
    { preHandler: requireAdmin } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = refreshBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid body", details: parsed.error.issues });
      }

      try {
        const runs = await dexPoolDiscoveryService.refreshAll(parsed.data.dexes);
        // A run that failed is reported in its own record, not as a 5xx: the
        // other DEXes in the batch may well have succeeded.
        return reply.send({ runs });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Refresh failed";
        logger.error({ error }, "DEX pool discovery refresh request failed");
        return reply.status(500).send({ error: message });
      }
    }
  );
}
