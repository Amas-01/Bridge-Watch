import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import {
  externalSourceResponseArchiveService,
  type ResponseOutcome,
} from "../../services/externalSourceResponseArchive.service.js";
import { logger } from "../../utils/logger.js";

/**
 * External Source Response Archive API (#1162).
 *
 * Mounted at `/api/v1/sources/response-archive`.
 *
 *   GET  /                       list archived responses (filter + cursor page)
 *   GET  /stats                  aggregate counts by source / outcome
 *   GET  /:id                    one response, metadata only
 *   GET  /:id/body               the raw archived body (separate call: large)
 *   PATCH /:id/retention         place or release a legal hold  (admin:config)
 *   POST /prune                  force a retention sweep         (admin:config)
 *
 * Reads require the `archive:read` scope; mutations require `admin:config`.
 */

const outcomeSchema = z.enum([
  "ok",
  "client_error",
  "server_error",
  "timeout",
  "transport_error",
]);

const listQuerySchema = z.object({
  sourceKey: z.string().trim().min(1).max(120).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  outcome: outcomeSchema.optional(),
  collectionRunId: z.string().trim().min(1).max(128).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().trim().min(1).optional(),
});

const retentionSchema = z.object({
  // null → legal hold (never expires); number → days from collection.
  retentionDays: z.number().int().min(1).max(3650).nullable(),
});

export async function externalSourceResponseArchiveRoutes(server: FastifyInstance) {
  const requireRead = authMiddleware({ requiredScopes: ["archive:read"] });
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:config"] });

  server.get(
    "/",
    {
      preHandler: requireRead,
      schema: {
        tags: ["External Source Response Archive"],
        summary: "List archived external source responses",
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = listQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid query", details: parsed.error.flatten() });
      }
      const { limit, cursor, ...filters } = parsed.data;
      const result = await externalSourceResponseArchiveService.list({
        ...filters,
        outcome: filters.outcome as ResponseOutcome | undefined,
        limit,
        cursor,
      });
      return reply.send(result);
    }
  );

  server.get(
    "/stats",
    {
      preHandler: requireRead,
      schema: {
        tags: ["External Source Response Archive"],
        summary: "Aggregate counts for the archive",
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { sourceKey } = request.query as { sourceKey?: string };
      const stats = await externalSourceResponseArchiveService.stats(sourceKey);
      return reply.send(stats);
    }
  );

  server.get<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: requireRead,
      schema: {
        tags: ["External Source Response Archive"],
        summary: "Fetch a single archived response (metadata + body)",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: {
          200: { type: "object", additionalProperties: true },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const record = await externalSourceResponseArchiveService.get(request.params.id);
      if (!record) {
        return reply.code(404).send({ error: "Archived response not found" });
      }
      // Metadata view: omit the (potentially large) body; /body serves it.
      const { responseBody, ...meta } = record;
      void responseBody;
      return reply.send(meta);
    }
  );

  server.get<{ Params: { id: string } }>(
    "/:id/body",
    {
      preHandler: requireRead,
      schema: {
        tags: ["External Source Response Archive"],
        summary: "Fetch just the raw archived response body",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        response: { 404: { $ref: "Error#" } },
      },
    },
    async (request, reply) => {
      const record = await externalSourceResponseArchiveService.get(request.params.id);
      if (!record) {
        return reply.code(404).send({ error: "Archived response not found" });
      }
      return reply.send({
        id: record.id,
        contentType: record.contentType,
        bodyTruncated: record.bodyTruncated,
        bodyHash: record.bodyHash,
        bodyBytes: record.bodyBytes,
        responseBody: record.responseBody,
      });
    }
  );

  server.patch<{ Params: { id: string }; Body: unknown }>(
    "/:id/retention",
    {
      preHandler: requireAdmin,
      schema: {
        tags: ["External Source Response Archive"],
        summary: "Set or clear the retention horizon (legal hold) for a response",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: { type: "object", additionalProperties: true },
        response: {
          200: { type: "object", additionalProperties: true },
          404: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      const parsed = retentionSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "Invalid body", details: parsed.error.flatten() });
      }
      const updated = await externalSourceResponseArchiveService.setRetention(
        request.params.id,
        parsed.data.retentionDays
      );
      if (!updated) {
        return reply.code(404).send({ error: "Archived response not found" });
      }
      logger.info(
        {
          id: request.params.id,
          retentionDays: parsed.data.retentionDays,
          actor: request.apiKeyAuth?.id ?? "admin",
        },
        "External source response retention updated"
      );
      return reply.send(updated);
    }
  );

  server.post(
    "/prune",
    {
      preHandler: requireAdmin,
      schema: {
        tags: ["External Source Response Archive"],
        summary: "Run a retention sweep now",
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const deleted = await externalSourceResponseArchiveService.pruneExpired();
      logger.info(
        { deleted, actor: request.apiKeyAuth?.id ?? "admin" },
        "External source response archive pruned on demand"
      );
      return reply.send({ deleted });
    }
  );
}
