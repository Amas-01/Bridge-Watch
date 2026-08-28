import type { FastifyRequest, FastifyReply } from "fastify";

/**
 * Fastify onRequest hook that validates tenant context presence
 * for authenticated routes.
 *
 * Tenant identity is set on request.tenantContext by the auth middleware.
 * This hook ensures the context is available before route handlers execute.
 */
export function tenantMiddleware() {
  return async function ensureTenantContext(
    request: FastifyRequest,
    _reply: FastifyReply
  ) {
    if (!request.apiKeyAuth) return;

    if (!request.tenantContext) {
      request.tenantContext = {
        tenantId: request.apiKeyAuth.id,
        actorId: request.apiKeyAuth.id,
        actorType: "user",
        bypass: false,
      };
    }
  };
}
