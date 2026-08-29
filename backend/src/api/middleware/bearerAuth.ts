import type { FastifyRequest, FastifyReply } from "fastify";
import { OAuth2Service } from "../../services/oauth2.service.js";
import { ApiKeyService } from "../../services/apiKey.service.js";

interface BearerAuthOptions {
  requiredScopes?: string[];
}

const oauth2Service = new OAuth2Service();
const apiKeyService = new ApiKeyService();

function extractBearerToken(authHeader: string | string[] | undefined): string | null {
  const header = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  
  if (!header || typeof header !== "string") {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export function bearerAuthMiddleware(options: BearerAuthOptions = {}) {
  return async function authenticate(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: "Missing or invalid Authorization header. Use 'Bearer <token>' format.",
      });
    }

    const validation = oauth2Service.verifyToken(token);

    if (!validation.valid || !validation.payload) {
      return reply.status(401).send({
        error: "Unauthorized",
        message: validation.error || "Invalid or expired token",
      });
    }

    const tokenScopes = oauth2Service.extractScopesFromToken(validation.payload);
    const requiredScopes = options.requiredScopes ?? [];

    if (requiredScopes.length > 0 && !hasRequiredScopes(tokenScopes, requiredScopes)) {
      return reply.status(403).send({
        error: "Forbidden",
        message: "Token does not have required scopes",
      });
    }

    const apiKey = await apiKeyService.listKeys();
    const keyRecord = apiKey.find((k) => k.id === validation.payload?.sub);

    request.apiKeyAuth = {
      id: validation.payload.sub,
      name: keyRecord?.name || validation.payload.client_id,
      scopes: tokenScopes,
      rateLimitPerMinute: keyRecord?.rateLimitPerMinute || 120,
      source: "api-key",
    };
  };
}

function hasRequiredScopes(granted: string[], required: string[]): boolean {
  if (!required.length) {
    return true;
  }
  if (granted.includes("*")) {
    return true;
  }
  return required.every((scope) => granted.includes(scope));
}
