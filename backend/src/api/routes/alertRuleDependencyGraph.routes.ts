import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { alertRuleDependencyGraphService } from "../../services/alertRuleDependencyGraph.service.js";
import { logger } from "../../utils/logger.js";
import { sendApiError } from "../utils/response.js";

export async function alertRuleDependencyGraphRoutes(server: FastifyInstance) {
  server.get("/", async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await alertRuleDependencyGraphService.buildGraph();
    } catch (error) {
      logger.error(error, "Failed to build alert rule dependency graph");
      return sendApiError(reply, 500, "Failed to build alert rule dependency graph");
    }
  });

  server.get(
    "/:ruleId",
    async (request: FastifyRequest<{ Params: { ruleId: string } }>, reply: FastifyReply) => {
      try {
        return await alertRuleDependencyGraphService.getRuleSubgraph(request.params.ruleId);
      } catch (error) {
        logger.error(error, "Failed to build alert rule dependency subgraph");
        return sendApiError(reply, 500, "Failed to build alert rule dependency subgraph");
      }
    }
  );
}
