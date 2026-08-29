import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { publicDatasetPublicationService } from "../../services/publicDatasetPublication.service.js";

interface RegisterDatasetBody {
  name: string;
  description: string;
  category: string;
  accessLevel?: "public" | "restricted" | "internal";
}

interface DatasetParams {
  datasetId: string;
}

interface ListQuery {
  limit?: string;
  offset?: string;
}

export async function publicDatasetPublicationRoutes(server: FastifyInstance) {
  // Register a new dataset for publication
  server.post<{ Body: RegisterDatasetBody }>(
    "/register",
    async (request: FastifyRequest<{ Body: RegisterDatasetBody }>, reply: FastifyReply) => {
      try {
        const { name, description, category, accessLevel } = request.body;

        if (!name || !description || !category) {
          return reply.code(400).send({ error: "Name, description, and category are required" });
        }

        const dataset = await publicDatasetPublicationService.registerDataset(
          name,
          description,
          category,
          accessLevel || "public"
        );

        return reply.code(201).send(dataset);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to register dataset";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Publish a dataset
  server.post<{ Params: DatasetParams }>(
    "/:datasetId/publish",
    async (request: FastifyRequest<{ Params: DatasetParams }>, reply: FastifyReply) => {
      try {
        const job = await publicDatasetPublicationService.publishDataset(request.params.datasetId);
        return reply.code(200).send(job);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to publish dataset";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get all public datasets
  server.get<{ Querystring: ListQuery }>(
    "/public",
    async (request: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

        const datasets = await publicDatasetPublicationService.getPublicDatasets(limit, offset);
        return reply.send({ datasets, limit, offset });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch public datasets";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Get dataset details
  server.get<{ Params: DatasetParams }>(
    "/:datasetId",
    async (request: FastifyRequest<{ Params: DatasetParams }>, reply: FastifyReply) => {
      try {
        const dataset = await publicDatasetPublicationService.getDatasetDetails(request.params.datasetId);
        return reply.send(dataset);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch dataset";
        return reply.code(404).send({ error: message });
      }
    }
  );

  // Retry failed publications
  server.post(
    "/retry-failed",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const count = await publicDatasetPublicationService.retryFailedPublications();
        return reply.send({ retriedCount: count });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to retry publications";
        return reply.code(500).send({ error: message });
      }
    }
  );
}
