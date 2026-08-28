import type { FastifyInstance } from "fastify";
import { incidentOwnershipTransferService } from "../../services/incidentOwnershipTransfer.service.js";
import { authMiddleware } from "../middleware/auth.js";

export async function incidentOwnershipTransferRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/:incidentId/transfer-ownership",
    { preHandler: authMiddleware({ requiredScopes: ["admin", "operator"] }) },
    async (request, reply) => {
      try {
        const { incidentId } = request.params as { incidentId: string };
        const { toOperator, initiatedBy, reason } = request.body as {
          toOperator?: string;
          initiatedBy?: string;
          reason?: string;
        };

        if (!toOperator || !initiatedBy) {
          return reply
            .code(400)
            .send({ success: false, error: "toOperator and initiatedBy are required" });
        }

        const result = await incidentOwnershipTransferService.transferOwnership({
          incidentId,
          toOperator,
          initiatedBy,
          reason,
        });

        return { success: true, data: result };
      } catch (error: any) {
        const message = error?.message ?? "Failed to transfer incident ownership";
        const status = message === "Incident not found" ? 404 : 400;
        fastify.log.error(error);
        return reply.code(status).send({ success: false, error: message });
      }
    }
  );

  fastify.get("/:incidentId/ownership-transfers", async (request, reply) => {
    try {
      const { incidentId } = request.params as { incidentId: string };
      const history = await incidentOwnershipTransferService.getTransferHistory(incidentId);
      return { success: true, data: history };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });
}
