import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { getOperationalIntelligenceService } from "../../services/operationalIntelligence.service.js";

type WindowQuery = {
  start?: string;
  end?: string;
};

export async function operationalIntelligenceRoutes(server: FastifyInstance) {
  const service = getOperationalIntelligenceService();

  server.get<{ Querystring: WindowQuery }>(
    "/endpoint-reliability-scorecards",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin"] }),
      schema: {
        tags: ["Operational Intelligence"],
        summary: "Build endpoint reliability scorecards",
        querystring: {
          type: "object",
          properties: {
            start: { type: "string", format: "date-time" },
            end: { type: "string", format: "date-time" },
          },
        },
      },
    },
    async (request) => ({
      data: await service.getEndpointReliabilityScorecards(request.query),
    }),
  );

  server.get<{ Querystring: WindowQuery & { horizonHours?: number } }>(
    "/api-consumer-usage-forecast",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin"] }),
      schema: {
        tags: ["Operational Intelligence"],
        summary: "Forecast API consumer usage",
        querystring: {
          type: "object",
          properties: {
            start: { type: "string", format: "date-time" },
            end: { type: "string", format: "date-time" },
            horizonHours: { type: "integer", minimum: 1, maximum: 336 },
          },
        },
      },
    },
    async (request) => ({
      data: await service.forecastApiConsumerUsage(request.query),
    }),
  );

  server.get<{ Querystring: { environment?: string } }>(
    "/feature-flag-dependencies",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin"] }),
      schema: {
        tags: ["Operational Intelligence"],
        summary: "Validate feature flag dependencies",
        querystring: {
          type: "object",
          properties: {
            environment: { type: "string", default: "production" },
          },
        },
      },
    },
    async (request) => ({
      data: await service.validateFeatureFlagDependencies(request.query.environment),
    }),
  );

  server.get<{ Querystring: WindowQuery }>(
    "/cache-hit-rate-attribution",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin"] }),
      schema: {
        tags: ["Operational Intelligence"],
        summary: "Attribute cache hit-rate by source",
        querystring: {
          type: "object",
          properties: {
            start: { type: "string", format: "date-time" },
            end: { type: "string", format: "date-time" },
          },
        },
      },
    },
    async (request) => ({
      data: await service.getCacheHitRateAttribution(request.query),
    }),
  );
}
