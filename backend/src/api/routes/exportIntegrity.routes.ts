import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify";
import { ExportIntegrityService } from "../../services/exportIntegrity.service.js";
import { logger } from "../../utils/logger.js";

export async function exportIntegrityRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
) {
  const service = new ExportIntegrityService();

  fastify.post(
    "/exports/:id/verify-integrity",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      try {
        const result = await service.verifyExportIntegrity(id);
        if (!result.isVerified) {
          return reply.code(400).send({ error: "Export integrity check failed", integrity: result });
        }
        return { verified: true, integrity: result };
      } catch (error) {
        logger.error({ error, exportId: id }, "Failed to verify export integrity");
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Failed to verify integrity" });
      }
    }
  );

  fastify.get(
    "/exports/:id/integrity",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      try {
        const status = await service.getIntegrityStatus(id);
        if (!status) return reply.code(404).send({ error: "Export record not found" });
        return status;
      } catch (error) {
        logger.error({ error, exportId: id }, "Failed to fetch export integrity status");
        return reply.code(500).send({ error: "Failed to fetch integrity status" });
      }
    }
  );
}
