import type { FastifyPluginAsync } from "fastify";
import { assetExposureService } from "../../services/assetExposure.service.js";

export const assetExposureRoutes: FastifyPluginAsync = async (server) => {
  server.get("/summary", async (_request, reply) => {
    const summary = await assetExposureService.getSummary();
    return reply.status(200).send(summary);
  });

  server.get("/breakdown", async (_request, reply) => {
    const breakdown = await assetExposureService.getBreakdown();
    return reply.status(200).send(breakdown);
  });

  server.get("/rebalance-alerts", async (_request, reply) => {
    const config = await assetExposureService.getAlertConfig();
    return reply.status(200).send(config);
  });

  server.post("/rebalance-alerts", async (request, reply) => {
    const body = request.body as any;
    const updatedConfig = await assetExposureService.updateAlertConfig(body || {});
    return reply.status(200).send(updatedConfig);
  });
};
