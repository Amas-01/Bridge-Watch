import type { FastifyInstance } from "fastify";
import { datasetColumnLineageService } from "../../services/datasetColumnLineage.service.js";
import { sendApiError } from "../utils/response.js";
import { authMiddleware } from "../middleware/auth.js";

interface CreateDatasetBody {
  name: string;
  displayName: string;
  description?: string;
  category?: string;
  sourceDatasetId?: string;
  columns?: Array<{
    name: string;
    dataType?: string;
    description?: string;
    isPrimaryKey?: boolean;
  }>;
}

export async function datasetColumnLineageRoutes(server: FastifyInstance) {
  const requireAuth = authMiddleware({ requiredScopes: ["datasets:read"] });

  // List datasets
  server.get<{ Querystring: { category?: string } }>(
    "/lineage/datasets",
    { preHandler: requireAuth },
    async (request) => {
      const datasets = await datasetColumnLineageService.listDatasets({
        category: request.query.category,
      });
      return { datasets };
    }
  );

  // List columns for a dataset
  server.get<{ Params: { datasetId: string } }>(
    "/lineage/datasets/:datasetId/columns",
    { preHandler: requireAuth },
    async (request, reply) => {
      const dataset = await datasetColumnLineageService.getDataset(
        request.params.datasetId
      );
      if (!dataset) {
        return sendApiError(reply, 404, "Dataset not found");
      }
      const columns = await datasetColumnLineageService.listColumns(
        request.params.datasetId
      );
      return { dataset, columns };
    }
  );

  // Get column lineage view
  server.get<{
    Params: { datasetId: string; columnId: string };
  }>(
    "/lineage/datasets/:datasetId/columns/:columnId",
    { preHandler: requireAuth },
    async (request, reply) => {
      const view = await datasetColumnLineageService.getColumnLineage(
        request.params.datasetId,
        request.params.columnId
      );
      if (!view) {
        return sendApiError(reply, 404, "Column lineage not found");
      }
      return view;
    }
  );

  // Create a dataset
  server.post<{ Body: CreateDatasetBody }>(
    "/lineage/datasets",
    { preHandler: authMiddleware({ requiredScopes: ["datasets:write"] }) },
    async (request, reply) => {
      const { name, displayName, description, category, sourceDatasetId, columns } =
        request.body;

      if (!name?.trim() || !displayName?.trim()) {
        return sendApiError(
          reply,
          400,
          "name and displayName are required"
        );
      }

      const dataset = await datasetColumnLineageService.createDataset({
        name,
        displayName,
        description,
        category,
        sourceDatasetId,
        columns,
        createdBy: request.apiKeyAuth?.name ?? "admin",
      });

      return reply.code(201).send({ dataset });
    }
  );
}
