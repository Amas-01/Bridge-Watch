import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { ApiKeyService } from "../../services/apiKey.service.js";
import { apiKeyScopeTemplateService } from "../../services/apiKeyScopeTemplate.service.js";

interface CreateApiKeyBody {
  name: string;
  scopes?: string[];
  template?: string;
  rateLimitPerMinute?: number;
  expiresInDays?: number;
  enableOAuth?: boolean;
}

interface ExtendApiKeyBody {
  extraDays: number;
}

export async function apiKeysRoutes(server: FastifyInstance) {
  const apiKeyService = new ApiKeyService();
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:api-keys"] });

  server.get("/", { preHandler: requireAdmin }, async () => {
    const keys = await apiKeyService.listKeys();
    return { keys };
  });

  server.post<{ Body: CreateApiKeyBody }>(
    "/",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { name, scopes = [], rateLimitPerMinute, expiresInDays, enableOAuth, template } = request.body;
      if (!name?.trim()) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "API key name is required.",
        });
      }

      // Resolve scopes/rate limit from a named template when provided.
      let resolvedScopes = scopes;
      let resolvedRateLimit = rateLimitPerMinute;
      if (template?.trim()) {
        const tpl = await apiKeyScopeTemplateService.getTemplateByName(template.trim());
        if (!tpl || !tpl.isActive) {
          return reply.code(400).send({
            error: "Bad Request",
            message: `Unknown or inactive API key scope template: ${template}`,
          });
        }
        if (!scopes || scopes.length === 0) {
          resolvedScopes = tpl.scopes;
        }
        if (resolvedRateLimit == null && tpl.rateLimitPerMinute != null) {
          resolvedRateLimit = tpl.rateLimitPerMinute;
        }
      }

      const expiresAt =
        expiresInDays && expiresInDays > 0
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
          : null;

      const result = await apiKeyService.createKey({
        name,
        scopes: resolvedScopes,
        rateLimitPerMinute: resolvedRateLimit,
        expiresAt,
        createdBy: request.apiKeyAuth?.name ?? "admin",
        enableOAuth,
      });

      return reply.code(201).send(result);
    }
  );

  server.post<{ Params: { id: string } }>(
    "/:id/rotate",
    { preHandler: requireAdmin },
    async (request) => {
      return apiKeyService.rotateKey(
        request.params.id,
        request.apiKeyAuth?.name ?? "admin"
      );
    }
  );

  server.post<{ Params: { id: string } }>(
    "/:id/revoke",
    { preHandler: requireAdmin },
    async (request) => {
      const key = await apiKeyService.revokeKey(
        request.params.id,
        request.apiKeyAuth?.name ?? "admin"
      );
      return { key };
    }
  );

  server.post<{ Params: { id: string }; Body: ExtendApiKeyBody }>(
    "/:id/extend",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const extraDays = Number(request.body?.extraDays ?? 0);
      if (extraDays < 1) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "extraDays must be at least 1.",
        });
      }

      const key = await apiKeyService.extendKeyExpiration(
        request.params.id,
        request.apiKeyAuth?.name ?? "admin",
        extraDays
      );

      return { key };
    }
  );
}
