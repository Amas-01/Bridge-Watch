import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { exportQuotaService } from "../../services/exportQuota.service.js";
import { logger } from "../../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

interface UserIdParams {
  userId: string;
}

interface SetQuotaBody {
  quotaType: "daily" | "monthly";
  maxExports: number;
}

// =============================================================================
// ROUTES
// =============================================================================

export async function exportQuotaRoutes(server: FastifyInstance) {
  const requireAuth = authMiddleware({ requiredScopes: [] });
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:quotas"] });

  // ---------------------------------------------------------------------------
  // GET CURRENT USER QUOTA — Get quota status for authenticated user
  // ---------------------------------------------------------------------------

  server.get(
    "/me",
    { preHandler: requireAuth } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = (request as any).apiKeyAuth?.id || "unknown";

        // Get both daily and monthly quotas
        const quotas = await exportQuotaService.getUserQuotas(userId);

        // Get current quota status for daily
        const dailyStatus = await exportQuotaService.checkQuota(userId, "daily");
        const monthlyStatus = await exportQuotaService.checkQuota(userId, "monthly");

        return {
          userId,
          quotas,
          status: {
            daily: dailyStatus,
            monthly: monthlyStatus,
          },
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to get user quota";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // LIST ALL USER QUOTAS — Admin only
  // ---------------------------------------------------------------------------

  server.get(
    "/",
    { preHandler: requireAdmin } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const quotas = await exportQuotaService.getAllUserQuotas();

        return {
          quotas,
          total: quotas.length,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to list user quotas";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // SET USER QUOTA — Admin only
  // ---------------------------------------------------------------------------

  server.post<{ Params: UserIdParams; Body: SetQuotaBody }>(
    "/:userId",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Params: UserIdParams; Body: SetQuotaBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { userId } = request.params;
        const { quotaType, maxExports } = request.body;

        if (!quotaType || maxExports === undefined) {
          return reply.code(400).send({
            error: "quotaType and maxExports are required",
          });
        }

        if (quotaType !== "daily" && quotaType !== "monthly") {
          return reply.code(400).send({
            error: "quotaType must be 'daily' or 'monthly'",
          });
        }

        if (maxExports < 0) {
          return reply.code(400).send({
            error: "maxExports must be a non-negative integer",
          });
        }

        const adminId = (request as any).apiKeyAuth?.id || "unknown";

        const quota = await exportQuotaService.setUserQuota(
          userId,
          { quotaType, maxExports },
          adminId
        );

        return { quota };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to set user quota";
        logger.error({ error }, message);
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET USER QUOTAS — Admin only
  // ---------------------------------------------------------------------------

  server.get<{ Params: UserIdParams }>(
    "/:userId",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Params: UserIdParams }>,
      reply: FastifyReply
    ) => {
      try {
        const { userId } = request.params;

        const quotas = await exportQuotaService.getUserQuotas(userId);

        return {
          userId,
          quotas,
          total: quotas.length,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to get user quotas";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );
}
