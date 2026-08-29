import type { FastifyInstance } from "fastify";
import { apiKeyScopeTemplateService } from "../../services/apiKeyScopeTemplate.service.js";
import { sendApiError } from "../utils/response.js";
import { authMiddleware } from "../middleware/auth.js";

interface CreateTemplateBody {
  name: string;
  description?: string;
  scopes: string[];
  rateLimitPerMinute?: number;
}

interface UpdateTemplateBody {
  name?: string;
  description?: string | null;
  scopes?: string[];
  rateLimitPerMinute?: number | null;
  isActive?: boolean;
}

export async function apiKeyScopeTemplateRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:api-keys"] });

  // List scope templates.
  server.get<{ Querystring: { includeInactive?: string } }>(
    "/",
    { preHandler: requireAdmin },
    async (request) => {
      const templates = await apiKeyScopeTemplateService.listTemplates(
        request.query.includeInactive === "true"
      );
      return { templates };
    }
  );

  // Get a single template.
  server.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const template = await apiKeyScopeTemplateService.getTemplate(
        request.params.id
      );
      if (!template) {
        return sendApiError(reply, 404, "Template not found");
      }
      return { template };
    }
  );

  // Create a scope template.
  server.post<{ Body: CreateTemplateBody }>(
    "/",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { name, description, scopes, rateLimitPerMinute } = request.body;
      if (!name?.trim()) {
        return sendApiError(reply, 400, "name is required");
      }
      if (!Array.isArray(scopes) || scopes.length === 0) {
        return sendApiError(reply, 400, "scopes must be a non-empty array");
      }

      try {
        const template = await apiKeyScopeTemplateService.createTemplate({
          name,
          description,
          scopes,
          rateLimitPerMinute,
          createdBy: request.apiKeyAuth?.name ?? "admin",
        });
        return reply.code(201).send({ template });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Template creation failed";
        return sendApiError(reply, 400, message);
      }
    }
  );

  // Update a scope template.
  server.patch<{ Params: { id: string }; Body: UpdateTemplateBody }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const template = await apiKeyScopeTemplateService.updateTemplate(
        request.params.id,
        request.body,
        request.apiKeyAuth?.name ?? "admin"
      );
      if (!template) {
        return sendApiError(reply, 404, "Template not found");
      }
      return { template };
    }
  );
}
