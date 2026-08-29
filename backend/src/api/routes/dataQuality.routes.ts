import type { FastifyPluginAsync } from "fastify";
import { dataQualityService } from "../../services/dataQuality.service.js";

export const dataQualityRoutes: FastifyPluginAsync = async (server) => {
  server.get("/scores", async (_request, reply) => {
    const scores = await dataQualityService.getQualityScores();
    return reply.status(200).send(scores);
  });

  server.get("/rules", async (_request, reply) => {
    const rules = await dataQualityService.getQualityRules();
    return reply.status(200).send(rules);
  });

  server.put("/rules", async (request, reply) => {
    const body = request.body as any;
    const updated = await dataQualityService.updateQualityRules(body || {});
    return reply.status(200).send(updated);
  });
};
