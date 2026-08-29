import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { alertNoiseReductionService } from "../../services/alertNoiseReduction.service.js";
import { authMiddleware } from "../middleware/auth.js";
import { getPaginationParams, formatPaginatedResponse } from "../../utils/pagination.js";

export async function alertNoiseReductionRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authMiddleware());

  server.post<{ Body: { accountId: string; alertRuleId: string; windowStart: string; windowEnd: string } }>(
    "/analyses",
    {
      schema: {
        tags: ["Alert Noise Reduction"],
        summary: "Create alert noise reduction analysis",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["accountId", "alertRuleId", "windowStart", "windowEnd"],
          properties: {
            accountId: { type: "string", format: "uuid" },
            alertRuleId: { type: "string" },
            windowStart: { type: "string", format: "date-time" },
            windowEnd: { type: "string", format: "date-time" },
            sampleSize: { type: "integer", default: 100 },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              analysis: { type: "object" },
              metrics: { type: "object" },
              recommendations: { type: "array" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { accountId, alertRuleId, windowStart, windowEnd, sampleSize } = request.body;

      const result = await alertNoiseReductionService.analyzeAlertNoise({
        accountId,
        alertRuleId,
        windowStart: new Date(windowStart),
        windowEnd: new Date(windowEnd),
        sampleSize,
      });

      return reply.status(201).send(result);
    },
  );

  server.get<{ Params: { analysisId: string } }>(
    "/analyses/:analysisId",
    {
      schema: {
        tags: ["Alert Noise Reduction"],
        summary: "Get alert noise analysis details",
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["analysisId"],
          properties: { analysisId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const { analysisId } = request.params;
      const result = await alertNoiseReductionService.getAnalysis(analysisId);
      return reply.send(result);
    },
  );

  server.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/accounts/:accountId/analyses",
    {
      schema: {
        tags: ["Alert Noise Reduction"],
        summary: "List analyses for an account",
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["accountId"],
          properties: { accountId: { type: "string", format: "uuid" } },
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string" },
            offset: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { accountId } = request.params;
      const { limit, offset } = getPaginationParams(request.query as Record<string, string>);

      const result = await alertNoiseReductionService.listAnalyses(accountId, limit, offset);

      return reply.send(
        formatPaginatedResponse(result.analyses, {
          total: result.pagination.total,
          limit,
          offset,
        }),
      );
    },
  );

  server.post<{ Params: { recommendationId: string } }>(
    "/recommendations/:recommendationId/apply",
    {
      schema: {
        tags: ["Alert Noise Reduction"],
        summary: "Apply alert noise recommendation",
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["recommendationId"],
          properties: { recommendationId: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const { recommendationId } = request.params;

      const result = await alertNoiseReductionService.applyRecommendation(recommendationId);

      return reply.send(result);
    },
  );
}
