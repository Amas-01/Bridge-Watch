import type { FastifyInstance } from "fastify";
import { sourceHealthRoutes } from "../sourceHealth.routes.js";
import { sourceHealthScoringRoutes } from "../sourceHealthScoring.routes.js";
import { sourceDecommissionRoutes } from "../sourceDecommission.routes.js";
import { dataQualityRoutes } from "../dataQuality.routes.js";
import { externalSourceResponseArchiveRoutes } from "../externalSourceResponseArchive.routes.js";

export async function registerSourceRoutes(server: FastifyInstance): Promise<void> {
  server.register(sourceHealthRoutes, { prefix: "/api/v1/sources/health" });
  server.register(sourceHealthScoringRoutes, {
    prefix: "/api/v1/sources/health-scoring",
  });
  server.register(sourceDecommissionRoutes, {
    prefix: "/api/v1/sources/decommission",
  });
  server.register(dataQualityRoutes, { prefix: "/api/v1/data-quality" });
  server.register(externalSourceResponseArchiveRoutes, {
    prefix: "/api/v1/sources/response-archive",
  });
}
