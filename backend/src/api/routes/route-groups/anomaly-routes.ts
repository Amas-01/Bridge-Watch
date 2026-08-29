import type { FastifyInstance } from "fastify";
import { anomalyDetectionRoutes } from "../anomalyDetection.routes.js";
import { anomalyTuningRoutes } from "../anomalyTuning.routes.js";

export async function registerAnomalyRoutes(server: FastifyInstance): Promise<void> {
  server.register(anomalyDetectionRoutes, { prefix: "/api/v1/anomaly-detection" });
  server.register(anomalyTuningRoutes, { prefix: "/api/v1/anomaly" });
}
