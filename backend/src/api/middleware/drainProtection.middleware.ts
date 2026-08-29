import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { drainProtocolService } from "../../services/drainProtocol.service.js";

const EXEMPT_PATHS = [
  "/health",
  "/healthz",
  "/readyz",
  "/api/v1/health",
  "/api/v1/admin/shutdown/drain/start",
  "/api/v1/admin/shutdown/drain/status",
  "/api/v1/admin/shutdown/drain/cancel",
  "/api/v1/admin/shutdown/drain/force",
  "/api/v1/admin/shutdown/drain/history",
];

export async function registerDrainProtectionMiddleware(server: FastifyInstance): Promise<void> {
  // Track in-flight request lifecycle
  server.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    drainProtocolService.incrementInFlight();

    reply.raw.on("finish", () => {
      drainProtocolService.decrementInFlight();
    });

    const isExempt = EXEMPT_PATHS.some((path) => request.url.startsWith(path));
    if (isExempt) {
      return;
    }

    if (drainProtocolService.isDraining()) {
      const isMutatingMethod = ["POST", "PUT", "DELETE", "PATCH"].includes(request.method.toUpperCase());

      if (isMutatingMethod || drainProtocolService.getMode() === "force") {
        reply.header("Retry-After", "30");
        return reply.status(503).send({
          error: "Service Unavailable",
          message: "Server is currently undergoing graceful shutdown drain",
          state: drainProtocolService.getState(),
          retryAfterSeconds: 30,
        });
      }
    }
  });
}
