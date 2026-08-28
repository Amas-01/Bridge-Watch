import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { tokenDecimalDetectionService } from "../../services/tokenDecimalDetection.service.js";
import { logger } from "../../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

interface AlertIdParams {
  id: string;
}

interface TokenAddressParams {
  tokenAddress: string;
}

interface AlertStatusQuery {
  status?: "open" | "acknowledged" | "resolved";
}

interface SnapshotHistoryQuery {
  chainId?: string;
}

// =============================================================================
// ROUTES
// =============================================================================

export async function tokenDecimalAlertsRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:monitoring"] });

  // ---------------------------------------------------------------------------
  // LIST ALERTS — Get all decimal change alerts by status
  // ---------------------------------------------------------------------------

  server.get<{ Querystring: AlertStatusQuery }>(
    "/",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Querystring: AlertStatusQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const { status } = request.query;

        let alerts;
        if (status) {
          alerts = await tokenDecimalDetectionService.getAlertsByStatus(status);
        } else {
          // Get all active alerts if no status specified
          alerts = await tokenDecimalDetectionService.getActiveAlerts();
        }

        return {
          alerts,
          total: alerts.length,
          status: status || "open",
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to list decimal change alerts";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // ACKNOWLEDGE ALERT — Mark an alert as acknowledged
  // ---------------------------------------------------------------------------

  server.post<{ Params: AlertIdParams }>(
    "/:id/acknowledge",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Params: AlertIdParams }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const acknowledgedBy = (request as any).apiKeyAuth?.id || "unknown";

        const alert = await tokenDecimalDetectionService.acknowledgeAlert(
          id,
          acknowledgedBy
        );

        return { alert };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to acknowledge alert";
        logger.error({ error }, message);

        if (message.includes("not found")) {
          return reply.code(404).send({ error: message });
        }

        return reply.code(400).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // RESOLVE ALERT — Mark an alert as resolved
  // ---------------------------------------------------------------------------

  server.post<{ Params: AlertIdParams }>(
    "/:id/resolve",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Params: AlertIdParams }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const resolvedBy = (request as any).apiKeyAuth?.id || "unknown";

        const alert = await tokenDecimalDetectionService.resolveAlert(
          id,
          resolvedBy
        );

        return { alert };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to resolve alert";
        logger.error({ error }, message);

        if (message.includes("not found")) {
          return reply.code(404).send({ error: message });
        }

        return reply.code(400).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET SNAPSHOT HISTORY — Get decimal snapshot history for a token
  // ---------------------------------------------------------------------------

  server.get<{ Params: TokenAddressParams; Querystring: SnapshotHistoryQuery }>(
    "/history/:tokenAddress",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{
        Params: TokenAddressParams;
        Querystring: SnapshotHistoryQuery;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { tokenAddress } = request.params;
        const { chainId } = request.query;

        const snapshots = await tokenDecimalDetectionService.getSnapshotHistory(
          tokenAddress,
          chainId
        );

        return {
          tokenAddress,
          chainId: chainId || "all",
          snapshots,
          total: snapshots.length,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to get snapshot history";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );
}
