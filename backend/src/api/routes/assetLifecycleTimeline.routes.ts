import type { FastifyInstance } from "fastify";
import {
  assetLifecycleTimelineService,
  type AssetState,
} from "../../services/assetLifecycleTimeline.service.js";
import { sendApiError } from "../utils/response.js";
import { authMiddleware } from "../middleware/auth.js";

interface RecordTransitionBody {
  assetId: string;
  assetSymbol: string;
  state: AssetState;
  previousState?: AssetState;
  reason?: string;
  triggeredBy?: string;
  metadata?: Record<string, unknown>;
}

export async function assetLifecycleTimelineRoutes(server: FastifyInstance) {
  const requireAuth = authMiddleware();

  // Record a new asset state transition
  server.post<{ Body: RecordTransitionBody }>(
    "/",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { assetId, assetSymbol, state, previousState, reason, triggeredBy, metadata } =
        request.body;

      if (!assetId?.trim() || !assetSymbol?.trim()) {
        return sendApiError(reply, 400, "assetId and assetSymbol are required");
      }
      if (!state) {
        return sendApiError(reply, 400, "state is required");
      }

      try {
        const record = await assetLifecycleTimelineService.recordTransition({
          assetId,
          assetSymbol,
          state,
          previousState,
          reason,
          triggeredBy: triggeredBy ?? request.apiKeyAuth?.name ?? "admin",
          metadata,
        });
        return reply.code(201).send({ record });
      } catch (error) {
        const message = error instanceof Error ? error.message : "State transition failed";
        return sendApiError(reply, 400, message);
      }
    }
  );

  // Get timeline entries with optional filters
  server.get<{
    Querystring: {
      assetId?: string;
      state?: AssetState;
      startDate?: string;
      endDate?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    "/",
    { preHandler: requireAuth },
    async (request) => {
      const records = await assetLifecycleTimelineService.getTimeline(
        request.query.assetId,
        {
          state: request.query.state,
          startDate: request.query.startDate,
          endDate: request.query.endDate,
          limit: request.query.limit ? Number(request.query.limit) : undefined,
          offset: request.query.offset ? Number(request.query.offset) : undefined,
        }
      );
      return { records };
    }
  );

  // Get timeline stats
  server.get(
    "/stats",
    { preHandler: requireAuth },
    async () => {
      const stats = await assetLifecycleTimelineService.getStats();
      return { stats };
    }
  );

  // Get latest state for a given asset
  server.get<{ Params: { assetId: string } }>(
    "/latest/:assetId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const record = await assetLifecycleTimelineService.getLatestState(
        request.params.assetId
      );
      if (!record) {
        return sendApiError(reply, 404, "No lifecycle history found for asset");
      }
      return { record };
    }
  );
}
