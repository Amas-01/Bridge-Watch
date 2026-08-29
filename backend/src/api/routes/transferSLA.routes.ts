import type { FastifyPluginAsync } from "fastify";
import { transferSLAService } from "../../services/transferSLA.service.js";

export const transferSLARoutes: FastifyPluginAsync = async (server) => {
  server.get("/metrics", async (_request, reply) => {
    const metrics = await transferSLAService.getSLAMetrics();
    return reply.status(200).send(metrics);
  });

  server.get("/breaches", async (_request, reply) => {
    const breaches = await transferSLAService.getSLABreaches();
    return reply.status(200).send(breaches);
  });

  server.get("/config", async (_request, reply) => {
    const config = await transferSLAService.getConfig();
    return reply.status(200).send(config);
  });

  server.post("/config", async (request, reply) => {
    const body = request.body as any;
    const updated = await transferSLAService.updateConfig(body || {});
    return reply.status(200).send(updated);
  });
};
