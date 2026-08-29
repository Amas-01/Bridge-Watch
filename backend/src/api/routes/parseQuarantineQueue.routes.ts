import type { FastifyInstance } from "fastify";
import {
  parseQuarantineQueueService,
  type QuarantineStatus,
} from "../../services/parseQuarantineQueue.service.js";
import { sendApiError } from "../utils/response.js";
import { authMiddleware } from "../middleware/auth.js";

interface EnqueueBody {
  source: string;
  dataType: string;
  rawPayload: Record<string, unknown>;
  parseError: string;
  errorCode?: string;
  priority?: number;
}

interface TransitionBody {
  note?: string;
}

const VALID_STATUSES: QuarantineStatus[] = [
  "quarantined",
  "in_review",
  "resolved",
  "disposed",
  "failed",
];

export async function parseQuarantineQueueRoutes(server: FastifyInstance) {
  const requireReviewer = authMiddleware({ requiredScopes: ["quarantine:manage"] });

  // Enqueue a failed-parse record.
  server.post<{ Body: EnqueueBody }>(
    "/",
    { preHandler: requireReviewer },
    async (request, reply) => {
      const { source, dataType, rawPayload, parseError, errorCode, priority } =
        request.body;

      if (!source?.trim() || !dataType?.trim()) {
        return sendApiError(reply, 400, "source and dataType are required");
      }
      if (!parseError?.trim()) {
        return sendApiError(reply, 400, "parseError is required");
      }

      try {
        const record = await parseQuarantineQueueService.enqueue({
          source,
          dataType,
          rawPayload,
          parseError,
          errorCode,
          priority,
        });
        return reply.code(201).send({ record });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Enqueue failed";
        return sendApiError(reply, 400, message);
      }
    }
  );

  // List quarantined records.
  server.get<{
    Querystring: {
      status?: QuarantineStatus;
      source?: string;
      dataType?: string;
      limit?: string;
      offset?: string;
    };
  }>(
    "/",
    { preHandler: requireReviewer },
    async (request) => {
      const records = await parseQuarantineQueueService.list({
        status: request.query.status,
        source: request.query.source,
        dataType: request.query.dataType,
        limit: request.query.limit ? Number(request.query.limit) : undefined,
        offset: request.query.offset ? Number(request.query.offset) : undefined,
      });
      return { records };
    }
  );

  // Get quarantine stats.
  server.get(
    "/stats",
    { preHandler: requireReviewer },
    async () => {
      const stats = await parseQuarantineQueueService.stats();
      return { stats };
    }
  );

  // Get a single record.
  server.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireReviewer },
    async (request, reply) => {
      const record = await parseQuarantineQueueService.get(request.params.id);
      if (!record) {
        return sendApiError(reply, 404, "Record not found");
      }
      return { record };
    }
  );

  // Retry a record.
  server.post<{ Params: { id: string } }>(
    "/:id/retry",
    { preHandler: requireReviewer },
    async (request, reply) => {
      const record = await parseQuarantineQueueService.retry(
        request.params.id,
        request.apiKeyAuth?.name ?? "admin"
      );
      if (!record) {
        return sendApiError(reply, 404, "Record not found or not retryable");
      }
      return { record };
    }
  );

  // Resolve a record.
  server.post<{ Params: { id: string }; Body: TransitionBody }>(
    "/:id/resolve",
    { preHandler: requireReviewer },
    async (request, reply) => {
      try {
        const record = await parseQuarantineQueueService.resolve(
          request.params.id,
          request.apiKeyAuth?.name ?? "admin",
          request.body?.note
        );
        if (!record) {
          return sendApiError(reply, 404, "Record not found");
        }
        return { record };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Transition failed";
        return sendApiError(reply, 400, message);
      }
    }
  );

  // Dispose a record.
  server.post<{ Params: { id: string }; Body: TransitionBody }>(
    "/:id/dispose",
    { preHandler: requireReviewer },
    async (request, reply) => {
      try {
        const record = await parseQuarantineQueueService.dispose(
          request.params.id,
          request.apiKeyAuth?.name ?? "admin",
          request.body?.note
        );
        if (!record) {
          return sendApiError(reply, 404, "Record not found");
        }
        return { record };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Transition failed";
        return sendApiError(reply, 400, message);
      }
    }
  );

  // Expose valid statuses for the frontend selector.
  server.get(
    "/statuses",
    { preHandler: requireReviewer },
    async () => {
      return { statuses: VALID_STATUSES };
    }
  );
}
