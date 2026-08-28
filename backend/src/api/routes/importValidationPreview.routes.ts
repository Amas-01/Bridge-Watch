import type { FastifyInstance } from "fastify";
import { importValidationPreviewService } from "../../services/importValidationPreview.service.js";
import { sendApiError } from "../utils/response.js";
import { authMiddleware } from "../middleware/auth.js";

interface CreatePreviewBody {
  dataType: string;
  rows: Array<Record<string, unknown>>;
  batchSize?: number;
}

export async function importValidationPreviewRoutes(server: FastifyInstance) {
  const requireAuth = authMiddleware({ requiredScopes: ["imports:preview"] });

  // Run (and store) a validation preview for an incoming import.
  server.post<{ Body: CreatePreviewBody }>(
    "/preview",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { dataType, rows, batchSize } = request.body;

      if (!dataType?.trim()) {
        return sendApiError(reply, 400, "dataType is required");
      }
      if (!Array.isArray(rows)) {
        return sendApiError(reply, 400, "rows must be an array");
      }

      try {
        const preview = await importValidationPreviewService.createPreview({
          dataType,
          rows,
          batchSize,
          createdBy: request.apiKeyAuth?.name ?? "admin",
        });
        return reply.code(201).send({ preview });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Preview failed";
        return sendApiError(reply, 400, message);
      }
    }
  );

  // List validation previews.
  server.get<{
    Querystring: { dataType?: string; limit?: string };
  }>(
    "/preview",
    { preHandler: requireAuth },
    async (request) => {
      const previews = await importValidationPreviewService.listPreviews({
        dataType: request.query.dataType,
        limit: request.query.limit ? Number(request.query.limit) : undefined,
      });
      return { previews };
    }
  );

  // Fetch a single preview.
  server.get<{ Params: { id: string } }>(
    "/preview/:id",
    { preHandler: requireAuth },
    async (request, reply) => {
      const preview = await importValidationPreviewService.getPreview(
        request.params.id
      );
      if (!preview) {
        return sendApiError(reply, 404, "Preview not found");
      }
      return { preview };
    }
  );

  // Failed-preview counts by data type (for the operator dashboard).
  server.get(
    "/preview/status",
    { preHandler: requireAuth },
    async () => {
      const counts = await importValidationPreviewService.countByStatus();
      return { counts };
    }
  );
}
