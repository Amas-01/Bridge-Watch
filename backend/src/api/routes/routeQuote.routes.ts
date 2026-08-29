import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import {
  routeQuoteService,
  QuoteExpiredError,
  QuoteNotFoundError,
  MAX_TTL_SECONDS,
} from "../../services/routeQuote.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Route Quote Expiration API (#1160).
 *
 * Mounted at `/api/v1/liquidity/route-quotes`.
 *
 *   POST /                    request a quote (carries a TTL)
 *   GET  /                    list an owner's quotes
 *   GET  /:id                 read one quote; expires it lazily if stale
 *   POST /:id/refresh         re-price and supersede
 *   POST /:id/consume         act on a quote — 409 if it has expired
 *   POST /expire-stale        bulk sweep  (admin:config)
 */

const createQuoteSchema = z.object({
  ownerAddress: z.string().trim().min(1).max(120),
  sourceAsset: z.string().trim().min(1).max(120),
  targetAsset: z.string().trim().min(1).max(120),
  inputAmount: z.number().positive(),
  ttlSeconds: z.number().int().min(1).max(MAX_TTL_SECONDS).optional(),
});

const listQuerySchema = z.object({
  owner: z.string().trim().min(1).max(120),
  status: z.enum(["active", "expired", "consumed", "superseded"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function routeQuoteRoutes(server: FastifyInstance) {
  const requireAuth = authMiddleware();
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:config"] });

  server.post(
    "/",
    { preHandler: requireAuth } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = createQuoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid body", details: parsed.error.issues });
      }

      try {
        const quote = await routeQuoteService.createQuote(parsed.data as any);
        return reply.status(201).send({ quote });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Quote failed";
        logger.error({ error }, "Route quote creation failed");
        return reply.status(422).send({ error: message });
      }
    }
  );

  server.get(
    "/",
    { preHandler: requireAuth } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid query", details: parsed.error.issues });
      }

      const quotes = await routeQuoteService.listQuotes(parsed.data.owner, {
        status: parsed.data.status,
        limit: parsed.data.limit,
      });
      return reply.send({ quotes, total: quotes.length });
    }
  );

  server.get(
    "/:id",
    { preHandler: requireAuth } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const quote = await routeQuoteService.getQuote(id);
      if (!quote) return reply.status(404).send({ error: `Quote ${id} not found` });
      return reply.send({ quote });
    }
  );

  server.post(
    "/:id/refresh",
    { preHandler: requireAuth } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const quote = await routeQuoteService.refreshQuote(id);
        return reply.send({ quote });
      } catch (error) {
        if (error instanceof QuoteNotFoundError) {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(409)
          .send({ error: error instanceof Error ? error.message : "Refresh failed" });
      }
    }
  );

  server.post(
    "/:id/consume",
    { preHandler: requireAuth } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        const quote = await routeQuoteService.consumeQuote(id);
        return reply.send({ quote });
      } catch (error) {
        if (error instanceof QuoteNotFoundError) {
          return reply.status(404).send({ error: error.message });
        }
        if (error instanceof QuoteExpiredError) {
          // 409 with the refresh path spelled out: the client's next move is to
          // re-quote, not to retry the same id.
          return reply.status(409).send({
            error: error.message,
            code: "QUOTE_EXPIRED",
            expiredAt: error.expiredAt,
            refreshUrl: `/api/v1/liquidity/route-quotes/${id}/refresh`,
          });
        }
        return reply
          .status(500)
          .send({ error: error instanceof Error ? error.message : "Consume failed" });
      }
    }
  );

  server.post(
    "/expire-stale",
    { preHandler: requireAdmin } as never,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const expired = await routeQuoteService.expireStale();
      return reply.send({ expired });
    }
  );
}
