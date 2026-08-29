import type { FastifyInstance } from "fastify";
import { sorobanEventIndexService } from "../../services/sorobanEventIndex.service.js";

export async function sorobanEventsRoutes(server: FastifyInstance) {
  server.get(
    "/",
    {
      schema: {
        tags: ["Soroban Events"],
        summary: "List paginated Soroban events",
        querystring: {
          type: "object",
          additionalProperties: false,
          properties: {
            contractId: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
            cursor: { type: "string" },
          },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request) => {
      const q = request.query as {
        contractId?: string;
        limit?: number;
        cursor?: string;
      };
      
      return sorobanEventIndexService.getPaginatedEvents(
        q.contractId,
        q.limit ?? 100,
        q.cursor
      );
    }
  );

  server.post(
    "/sync",
    {
      schema: {
        tags: ["Soroban Events"],
        summary: "Trigger a manual sync of Soroban events",
        body: {
          type: "object",
          required: ["contractId"],
          additionalProperties: false,
          properties: {
            contractId: { type: "string" },
            limit: { type: "integer", minimum: 1, maximum: 10000, default: 1000 },
          },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request) => {
      const body = request.body as { contractId: string; limit?: number };
      const syncedCount = await sorobanEventIndexService.syncEvents(body.contractId, body.limit);
      return { syncedCount };
    }
  );
}
