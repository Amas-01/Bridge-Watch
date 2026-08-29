import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { apiChangelogDiffService } from "../../services/apiChangelogDiff.service.js";

interface DiffQuery {
  from?: string;
  to?: string;
}

interface VersionParams {
  version: string;
}

export async function apiChangelogDiffRoutes(server: FastifyInstance) {
  // Get diff between two versions
  server.get<{ Querystring: DiffQuery }>(
    "/diff",
    async (request: FastifyRequest<{ Querystring: DiffQuery }>, reply: FastifyReply) => {
      try {
        const { from, to } = request.query;

        if (!from || !to) {
          return reply.code(400).send({ error: "Both 'from' and 'to' version parameters are required" });
        }

        const diff = await apiChangelogDiffService.getDiff(from, to);
        return reply.send(diff);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to generate changelog diff";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get all available versions
  server.get(
    "/versions",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const versions = await apiChangelogDiffService.getAllVersions();
        return reply.send({ versions });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch versions";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Get details for a specific version
  server.get<{ Params: VersionParams }>(
    "/versions/:version",
    async (request: FastifyRequest<{ Params: VersionParams }>, reply: FastifyReply) => {
      try {
        const details = await apiChangelogDiffService.getVersionDetails(request.params.version);
        return reply.send(details);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch version details";
        return reply.code(404).send({ error: message });
      }
    }
  );
}
