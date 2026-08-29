import type { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ReportTemplateVersionService } from "../../services/reportTemplateVersion.service.js";
import { logger } from "../../utils/logger.js";

const createVersionSchema = z.object({
  author: z.string().trim().min(1),
  name: z.string().trim().optional(),
  type: z.string().trim().optional(),
  description: z.string().trim().optional(),
  sections: z.array(z.record(z.unknown())).optional(),
  includes: z.record(z.boolean()).optional(),
  filters: z.array(z.record(z.unknown())).optional(),
  changeSummary: z.string().trim().optional(),
});

const restoreVersionSchema = z.object({
  restoredBy: z.string().trim().min(1),
});

export async function reportTemplateVersionRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
) {
  const service = new ReportTemplateVersionService();

  fastify.post(
    "/templates/:id/versions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = createVersionSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid version payload", details: parsed.error.flatten() });
      }

      try {
        const version = await service.createVersion(id, parsed.data, parsed.data.author);
        return reply.code(201).send({ version });
      } catch (error) {
        logger.error({ error, templateId: id }, "Failed to create report template version");
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Failed to create version" });
      }
    }
  );

  fastify.get(
    "/templates/:id/versions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };

      try {
        const versions = await service.listVersions(id);
        return { versions };
      } catch (error) {
        logger.error({ error, templateId: id }, "Failed to list report template versions");
        return reply.code(500).send({ error: "Failed to list template versions" });
      }
    }
  );

  fastify.get(
    "/templates/:id/versions/:version",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, version } = request.params as { id: string; version: string };
      const parsedVersion = parseInt(version, 10);
      if (isNaN(parsedVersion)) {
        return reply.code(400).send({ error: "Invalid version parameter" });
      }

      try {
        const verRecord = await service.getVersion(id, parsedVersion);
        if (!verRecord) return reply.code(404).send({ error: "Template version not found" });
        return verRecord;
      } catch (error) {
        logger.error({ error, templateId: id, version }, "Failed to fetch template version");
        return reply.code(500).send({ error: "Failed to fetch template version" });
      }
    }
  );

  fastify.post(
    "/templates/:id/versions/:version/restore",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id, version } = request.params as { id: string; version: string };
      const parsedVersion = parseInt(version, 10);
      if (isNaN(parsedVersion)) {
        return reply.code(400).send({ error: "Invalid version parameter" });
      }

      const parsedBody = restoreVersionSchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        return reply.code(400).send({ error: "Invalid restore payload", details: parsedBody.error.flatten() });
      }

      try {
        const restored = await service.restoreVersion(id, parsedVersion, parsedBody.data.restoredBy);
        return reply.code(201).send({ version: restored });
      } catch (error) {
        logger.error({ error, templateId: id, version }, "Failed to restore template version");
        return reply.code(400).send({ error: error instanceof Error ? error.message : "Failed to restore version" });
      }
    }
  );
}
