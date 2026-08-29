import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { trustlineAnalyticsService } from "../../services/trustlineAnalytics.service.js";
import { authMiddleware } from "../middleware/auth.js";

interface RecordSnapshotBody {
  assetCode: string;
  assetIssuer: string;
  totalTrustlines: number;
  activeTrustlines: number;
  totalBalance: number;
  concentration: Array<{ percentile: string; balancePercentage: number }>;
}

interface QueryLatestQuery {
  assetCode: string;
  assetIssuer: string;
}

interface QueryHistoryQuery {
  assetCode: string;
  assetIssuer: string;
  limit?: string;
}

export async function trustlineAnalyticsRoutes(server: FastifyInstance) {
  // Record a new trustline distribution snapshot (admin only)
  server.post<{ Body: RecordSnapshotBody }>(
    "/trustlines/snapshots",
    {
      preHandler: [authMiddleware({ requiredScopes: ["admin"] })],
      schema: {
        tags: ["Trustline Analytics"],
        summary: "Record a trustline snapshot",
        body: {
          type: "object",
          required: ["assetCode", "assetIssuer", "totalTrustlines", "activeTrustlines", "totalBalance", "concentration"],
          properties: {
            assetCode: { type: "string" },
            assetIssuer: { type: "string" },
            totalTrustlines: { type: "integer", minimum: 0 },
            activeTrustlines: { type: "integer", minimum: 0 },
            totalBalance: { type: "number", minimum: 0 },
            concentration: {
              type: "array",
              items: {
                type: "object",
                required: ["percentile", "balancePercentage"],
                properties: {
                  percentile: { type: "string" },
                  balancePercentage: { type: "number", minimum: 0, maximum: 100 }
                }
              }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: RecordSnapshotBody }>, reply: FastifyReply) => {
      try {
        const { assetCode, assetIssuer, totalTrustlines, activeTrustlines, totalBalance, concentration } = request.body;
        const report = await trustlineAnalyticsService.recordSnapshot(
          assetCode,
          assetIssuer,
          totalTrustlines,
          activeTrustlines,
          totalBalance,
          concentration
        );
        return reply.code(201).send(report);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to record snapshot";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get the latest trustline report for an asset (public)
  server.get<{ Querystring: QueryLatestQuery }>(
    "/trustlines/latest",
    {
      schema: {
        tags: ["Trustline Analytics"],
        summary: "Get latest trustline snapshot report for an asset",
        querystring: {
          type: "object",
          required: ["assetCode", "assetIssuer"],
          properties: {
            assetCode: { type: "string" },
            assetIssuer: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Querystring: QueryLatestQuery }>, reply: FastifyReply) => {
      try {
        const { assetCode, assetIssuer } = request.query;
        const report = await trustlineAnalyticsService.getLatestReport(assetCode, assetIssuer);
        if (!report) {
          return reply.code(404).send({ error: "No snapshots found for asset" });
        }
        return reply.send(report);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch report";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Get historical trustline snapshots for an asset (public)
  server.get<{ Querystring: QueryHistoryQuery }>(
    "/trustlines/history",
    {
      schema: {
        tags: ["Trustline Analytics"],
        summary: "Get historical trustline snapshots for an asset",
        querystring: {
          type: "object",
          required: ["assetCode", "assetIssuer"],
          properties: {
            assetCode: { type: "string" },
            assetIssuer: { type: "string" },
            limit: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Querystring: QueryHistoryQuery }>, reply: FastifyReply) => {
      try {
        const { assetCode, assetIssuer } = request.query;
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;
        const history = await trustlineAnalyticsService.getHistoricalSnapshots(assetCode, assetIssuer, limit);
        return reply.send({ history });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch history";
        return reply.code(500).send({ error: message });
      }
    }
  );
}
