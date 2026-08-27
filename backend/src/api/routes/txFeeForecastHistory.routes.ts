import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { TxFeeForecastHistoryService } from "../../services/txFeeForecastHistory.service.js";
import { logger } from "../../utils/logger.js";

const service = new TxFeeForecastHistoryService();

interface ForecastQuery {
  period?: "1h" | "24h" | "7d" | "30d";
  bypassCache?: string;
}

interface VolatilityQuery {
  period?: "24h" | "7d" | "30d";
}

export async function txFeeForecastHistoryRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: ForecastQuery }>(
    "/history",
    {
      schema: {
        description: "Get transaction fee forecast history with SMA-based projections",
        tags: ["fee-forecast"],
        querystring: {
          type: "object",
          properties: {
            period: {
              type: "string",
              enum: ["1h", "24h", "7d", "30d"],
              description: "Lookback window (default: 24h)",
            },
            bypassCache: { type: "string", enum: ["true", "false"] },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              period: { type: "string" },
              currentMedianFee: { type: "number" },
              forecastedFee: { type: "number" },
              trend: { type: "string", enum: ["rising", "falling", "stable"] },
              changePercent: { type: "number" },
              dataPoints: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    timestamp: { type: "string" },
                    medianFee: { type: "number" },
                    p95Fee: { type: "number" },
                    forecastFee: { type: "number" },
                    ledgerCount: { type: "number" },
                  },
                },
              },
              generatedAt: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: ForecastQuery }>,
      reply: FastifyReply,
    ) => {
      try {
        const { period = "24h", bypassCache } = request.query;
        const result = await service.getForecastHistory(period, bypassCache === "true");
        return reply.send(result);
      } catch (error) {
        logger.error({ error }, "Failed to fetch fee forecast history");
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );

  fastify.get<{ Querystring: VolatilityQuery }>(
    "/volatility",
    {
      schema: {
        description: "Get fee volatility report for the specified period",
        tags: ["fee-forecast"],
        querystring: {
          type: "object",
          properties: {
            period: {
              type: "string",
              enum: ["24h", "7d", "30d"],
              description: "Analysis period (default: 7d)",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              period: { type: "string" },
              minFee: { type: "number" },
              maxFee: { type: "number" },
              avgFee: { type: "number" },
              stdDev: { type: "number" },
              volatilityScore: { type: "number" },
              generatedAt: { type: "string" },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: VolatilityQuery }>,
      reply: FastifyReply,
    ) => {
      try {
        const { period = "7d" } = request.query;
        const result = await service.getVolatilityReport(period);
        return reply.send(result);
      } catch (error) {
        logger.error({ error }, "Failed to fetch fee volatility report");
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );
}
