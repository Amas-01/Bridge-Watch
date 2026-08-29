import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  AlertHistorySearchService,
  type RawAlertHistoryQuery,
} from "../../services/alertHistorySearch.service.js";
import { logger } from "../../utils/logger.js";
import { validateRequest } from "../middleware/validation.js";
import {
  AlertHistoryRouteQuerySchema,
  AlertHistorySuccessSchema,
  ApiErrorSchema,
  toOpenApiSchema,
} from "../schemas/openapiSchemas.js";

const service = new AlertHistorySearchService();

export async function alertHistoryRoutes(server: FastifyInstance) {
  // GET / — paginated, filtered search over historical alerts.
  server.get(
    "/",
    {
      preHandler: validateRequest({ query: AlertHistoryRouteQuerySchema }),
      schema: {
        tags: ["Alerts"],
        summary: "Search alert history",
        querystring: toOpenApiSchema(AlertHistoryRouteQuerySchema),
        response: {
          200: toOpenApiSchema(AlertHistorySuccessSchema),
          400: toOpenApiSchema(ApiErrorSchema),
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: RawAlertHistoryQuery }>,
      reply: FastifyReply,
    ) => {
      try {
        const data = await service.search(request.query);
        return { success: true, data };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to search alert history";
        logger.warn({ err: error }, "alert history search failed");
        reply.code(400);
        return { success: false, error: message };
      }
    },
  );

  // GET /export — same filters, returned as a CSV attachment.
  server.get(
    "/export",
    {
      preHandler: validateRequest({ query: AlertHistoryRouteQuerySchema }),
      schema: {
        tags: ["Alerts"],
        summary: "Export alert history as CSV",
        querystring: toOpenApiSchema(AlertHistoryRouteQuerySchema),
        response: {
          200: { type: "string", description: "CSV alert history export" },
          400: toOpenApiSchema(ApiErrorSchema),
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: RawAlertHistoryQuery }>,
      reply: FastifyReply,
    ) => {
      try {
        const csv = await service.exportCsv(request.query);
        reply.header("Content-Type", "text/csv");
        reply.header("Content-Disposition", 'attachment; filename="alert-history.csv"');
        return csv;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to export alert history";
        logger.warn({ err: error }, "alert history export failed");
        reply.code(400);
        return { success: false, error: message };
      }
    },
  );
}
