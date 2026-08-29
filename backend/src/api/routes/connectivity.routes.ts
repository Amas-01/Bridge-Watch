import { FastifyInstance } from "fastify";
import { ChainConnectivityService } from "../../services/chainConnectivity.service.js";
import { getDb } from "../../database/connection.js";

export async function connectivityRoutes(fastify: FastifyInstance) {
  const db = getDb();
  const service = new ChainConnectivityService(db);

  fastify.get(
    "/connectivity/chains/:chainId/comparison",
    async (request, reply) => {
      try {
        const { chainId } = request.params as any;
        const snapshot = await service.getComparisonMap(chainId);

        if (!snapshot) {
          return reply
            .code(404)
            .send({ success: false, error: "No snapshot found" });
        }

        return { success: true, data: snapshot };
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ success: false, error: error.message });
      }
    },
  );

  fastify.post(
    "/connectivity/chains/:chainId/check",
    async (request, reply) => {
      try {
        const { chainId } = request.params as any;
        await service.generateComparisonSnapshot(chainId);
        return { success: true, message: "Connectivity check initiated" };
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ success: false, error: error.message });
      }
    },
  );

  fastify.post(
    "/connectivity/endpoints/:endpointId/check",
    async (request, reply) => {
      try {
        const { endpointId } = request.params as any;
        const check = await service.checkEndpoint(endpointId);
        return { success: true, data: check };
      } catch (error: any) {
        fastify.log.error(error);
        return reply.code(500).send({ success: false, error: error.message });
      }
    },
  );

  fastify.post("/connectivity/check-all", async (request, reply) => {
    try {
      const results = await service.checkAllEndpoints();
      const resultsObject = Object.fromEntries(results);
      return { success: true, data: resultsObject };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });
}
