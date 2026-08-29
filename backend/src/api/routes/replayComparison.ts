import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { ReplayComparisonService } from "../../services/replayComparison.service.js";
import { authMiddleware } from "../middleware/auth.js";

export async function replayComparisonRoutes(server: FastifyInstance) {
  const service = new ReplayComparisonService();

  server.addHook("preHandler", authMiddleware());

  server.get<{ Querystring: { assetCode: string; limit?: string } }>(
    "/snapshots",
    {
      schema: {
        tags: ["Replay Comparison"],
        summary: "Get replay snapshots for asset",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          required: ["assetCode"],
          properties: {
            assetCode: { type: "string" },
            limit: { type: "string" },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { assetCode, limit } = request.query as { assetCode: string; limit?: string };
      const snapshots = await service.getSnapshotsForAsset(assetCode, limit ? parseInt(limit) : 10);
      reply.send({ snapshots });
    }
  );

  server.post<{
    Body: {
      assetCode: string;
      snapshotType: string;
      snapshotData: Record<string, unknown>;
      snapshotTime: string;
    };
  }>(
    "/snapshots",
    {
      schema: {
        tags: ["Replay Comparison"],
        summary: "Create replay snapshot",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["assetCode", "snapshotType", "snapshotData", "snapshotTime"],
          properties: {
            assetCode: { type: "string" },
            snapshotType: { type: "string" },
            snapshotData: { type: "object" },
            snapshotTime: { type: "string", format: "date-time" },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { assetCode, snapshotType, snapshotData, snapshotTime } = request.body;
      const snapshot = await service.createSnapshot(
        assetCode,
        snapshotType,
        snapshotData,
        new Date(snapshotTime)
      );
      reply.code(201).send({ snapshot });
    }
  );

  server.get<{ Querystring: { snapshot1Id: string; snapshot2Id: string } }>(
    "/diff",
    {
      schema: {
        tags: ["Replay Comparison"],
        summary: "Compare two replay snapshots",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          required: ["snapshot1Id", "snapshot2Id"],
          properties: {
            snapshot1Id: { type: "string", format: "uuid" },
            snapshot2Id: { type: "string", format: "uuid" },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { snapshot1Id, snapshot2Id } = request.query as { snapshot1Id: string; snapshot2Id: string };
      const snapshot1 = await service.getSnapshot(snapshot1Id);
      const snapshot2 = await service.getSnapshot(snapshot2Id);

      if (!snapshot1 || !snapshot2) {
        return reply.code(404).send({ error: "Snapshot not found" });
      }

      const diffs = service.compareSnapshots(snapshot1, snapshot2);
      reply.send({ diffs, snapshot1, snapshot2 });
    }
  );
}
