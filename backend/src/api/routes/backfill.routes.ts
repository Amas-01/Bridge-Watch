import type { FastifyInstance } from "fastify";
import { backfillService } from "../../services/backfill.service.js";
import { logger } from "../../utils/logger.js";

export async function backfillRoutes(server: FastifyInstance) {
  server.post<{ Params: { sourceId: string } }>(
    "/:sourceId/start",
    {
      schema: {
        tags: ["Backfill"],
        summary: "Start a backfill for a source",
        params: {
          type: "object",
          required: ["sourceId"],
          properties: { sourceId: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["rangeStart", "rangeEnd", "chunkSize"],
          properties: {
            rangeStart: { type: "integer" },
            rangeEnd: { type: "integer" },
            chunkSize: { type: "integer", minimum: 1 },
          }
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      const { sourceId } = request.params;
      const config = request.body as any;

      try {
        const jobId = await backfillService.startBackfillForSource(sourceId, config, {
          processChunk: async (chunk) => {
            // Placeholder: actual processing logic would be injected or handled here
            // e.g. await fetchHistoricalDataForChunk(sourceId, chunk);
            await new Promise(r => setTimeout(r, 100)); // mock work
          }
        });
        return { success: true, jobId };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  server.post<{ Params: { sourceId: string } }>(
    "/:sourceId/stop",
    {
      schema: {
        tags: ["Backfill"],
        summary: "Stop a backfill for a source",
        params: {
          type: "object",
          required: ["sourceId"],
          properties: { sourceId: { type: "string" } },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      const { sourceId } = request.params;
      try {
        await backfillService.stopBackfillForSource(sourceId);
        return { success: true };
      } catch (err: any) {
        return reply.code(400).send({ error: err.message });
      }
    }
  );

  server.get<{ Params: { sourceId: string } }>(
    "/:sourceId/status",
    {
      schema: {
        tags: ["Backfill"],
        summary: "Get backfill status for a source",
        params: {
          type: "object",
          required: ["sourceId"],
          properties: { sourceId: { type: "string" } },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      const status = await backfillService.getBackfillStatus(request.params.sourceId);
      if (!status) {
        return reply.code(404).send({ error: "No backfill job found for source" });
      }
      return status;
    }
  );
}
