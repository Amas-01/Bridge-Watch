import type { FastifyPluginAsync } from "fastify";
import { providerLatencyService } from "../../services/providerLatency.service.js";

export const providerLatencyRoutes: FastifyPluginAsync = async (server) => {
  server.get("/comparison", async (_request, reply) => {
    const comparison = await providerLatencyService.getComparison();
    return reply.status(200).send(comparison);
  });

  server.get("/historical", async (_request, reply) => {
    const historical = await providerLatencyService.getHistorical();
    return reply.status(200).send(historical);
  });

  server.post("/benchmark", async (_request, reply) => {
    const result = await providerLatencyService.triggerBenchmark();
    return reply.status(200).send(result);
  });
};
