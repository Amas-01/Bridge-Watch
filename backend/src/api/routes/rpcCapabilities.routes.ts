import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { rpcCapabilityDiscoveryService } from "../../services/rpcCapabilityDiscovery.service.js";
import { rpcCapabilityRefreshQueue } from "../../jobs/rpcCapabilityRefresh.job.js";
import { logger } from "../../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

interface EndpointUrlParams {
  endpointUrl: string;
}

// =============================================================================
// ROUTES
// =============================================================================

export async function rpcCapabilitiesRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:rpc"] });

  // ---------------------------------------------------------------------------
  // LIST ALL — Get all RPC endpoints with their capabilities
  // ---------------------------------------------------------------------------

  server.get(
    "/",
    { preHandler: requireAdmin } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const endpoints = await rpcCapabilityDiscoveryService.getAllEndpoints();

        const endpointsWithCapabilities = await Promise.all(
          endpoints.map(async (endpointUrl) => {
            const capabilities = await rpcCapabilityDiscoveryService.getCapabilities(
              endpointUrl
            );
            return {
              endpointUrl,
              capabilities,
              supportedCount: capabilities.filter((c) => c.isSupported).length,
              totalCount: capabilities.length,
              lastCheckedAt: capabilities[0]?.lastCheckedAt || null,
            };
          })
        );

        return {
          endpoints: endpointsWithCapabilities,
          total: endpointsWithCapabilities.length,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to list RPC capabilities";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET BY ENDPOINT — Get capabilities for a specific RPC endpoint
  // ---------------------------------------------------------------------------

  server.get<{ Params: EndpointUrlParams }>(
    "/:endpointUrl",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Params: EndpointUrlParams }>,
      reply: FastifyReply
    ) => {
      try {
        const endpointUrl = decodeURIComponent(request.params.endpointUrl);

        logger.info({ endpointUrl }, "Fetching RPC capabilities for endpoint");

        const capabilities = await rpcCapabilityDiscoveryService.getCapabilities(
          endpointUrl
        );

        if (capabilities.length === 0) {
          return reply.code(404).send({
            error: "No capabilities found for this endpoint",
          });
        }

        return {
          endpointUrl,
          capabilities,
          supportedCount: capabilities.filter((c) => c.isSupported).length,
          totalCount: capabilities.length,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to get RPC capabilities";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // REFRESH — Trigger capability refresh for a specific endpoint
  // ---------------------------------------------------------------------------

  server.post<{ Params: EndpointUrlParams }>(
    "/:endpointUrl/refresh",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Params: EndpointUrlParams }>,
      reply: FastifyReply
    ) => {
      try {
        const endpointUrl = decodeURIComponent(request.params.endpointUrl);

        logger.info({ endpointUrl }, "Triggering RPC capability refresh");

        // Enqueue refresh job
        await rpcCapabilityRefreshQueue.triggerRefresh(endpointUrl);

        return reply.code(202).send({
          message: "RPC capability refresh job enqueued",
          endpointUrl,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to trigger RPC capability refresh";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // DISCOVER — Discover capabilities for a new RPC endpoint
  // ---------------------------------------------------------------------------

  server.post<{ Body: { endpointUrl: string } }>(
    "/discover",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Body: { endpointUrl: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { endpointUrl } = request.body;

        if (!endpointUrl) {
          return reply.code(400).send({ error: "endpointUrl is required" });
        }

        logger.info({ endpointUrl }, "Discovering RPC capabilities");

        const capabilities = await rpcCapabilityDiscoveryService.discoverCapabilities(
          endpointUrl
        );

        return reply.code(201).send({
          endpointUrl,
          capabilities,
          supportedCount: capabilities.filter((c) => c.isSupported).length,
          totalCount: capabilities.length,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to discover RPC capabilities";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );
}
