import type { FastifyInstance } from "fastify";
import {
  getDashboardWidgetContract,
  listDashboardWidgetContracts,
} from "../../services/dashboardWidgetContracts.service.js";
import { inspectRedisNamespaces } from "../../services/redisNamespace.service.js";
import { getWorkerCapacityMetrics } from "../../services/workerCapacity.service.js";

export async function platformContractsRoutes(server: FastifyInstance) {
  server.get(
    "/dashboard-widget-contracts",
    {
      schema: {
        tags: ["Platform Contracts"],
        summary: "List dashboard widget data contracts",
      },
    },
    async () => ({ data: listDashboardWidgetContracts() }),
  );

  server.get<{ Params: { id: string } }>(
    "/dashboard-widget-contracts/:id",
    {
      schema: {
        tags: ["Platform Contracts"],
        summary: "Get a dashboard widget data contract",
      },
    },
    async (request, reply) => {
      const contract = getDashboardWidgetContract(request.params.id);
      if (!contract) return reply.code(404).send({ error: "Widget contract not found" });
      return { data: contract };
    },
  );

  server.get<{ Querystring: { pattern?: string; sampleSize?: number } }>(
    "/redis/namespaces",
    {
      schema: {
        tags: ["Platform Contracts"],
        summary: "Inspect Redis key namespaces",
        querystring: {
          type: "object",
          properties: {
            pattern: { type: "string", default: "*" },
            sampleSize: { type: "integer", minimum: 0, maximum: 20, default: 5 },
          },
        },
      },
    },
    async (request) => ({
      data: await inspectRedisNamespaces(request.query.pattern, request.query.sampleSize),
    }),
  );

  server.get(
    "/workers/capacity",
    {
      schema: {
        tags: ["Platform Contracts"],
        summary: "Get worker capacity planning metrics",
      },
    },
    async () => ({ data: await getWorkerCapacityMetrics() }),
  );
}
