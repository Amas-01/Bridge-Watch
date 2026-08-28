import type { FastifyInstance } from "fastify";
import { incidentRoutes } from "../incidents.routes.js";
import { incidentsRoutes } from "../incidents.js";
import { incidentCorrelationRoutes } from "../incidentCorrelation.routes.js";
import { incidentTimelineRoutes } from "../incidentTimeline.routes.js";
import { causalGraphRoutes } from "../causalGraph.routes.js";
import { incidentOwnershipTransferRoutes } from "../incidentOwnershipTransfer.routes.js";

export async function registerIncidentRoutes(server: FastifyInstance): Promise<void> {
  server.register(incidentRoutes, { prefix: "/api/v1/incidents" });
  server.register(incidentsRoutes, { prefix: "/api/v1/incidents-heatmap" });
  server.register(incidentCorrelationRoutes, { prefix: "/api/v1/incidents" });
  server.register(incidentTimelineRoutes, { prefix: "/api/v1/incidents" });
  server.register(causalGraphRoutes, { prefix: "/api/v1/incidents" });
  server.register(incidentOwnershipTransferRoutes, { prefix: "/api/v1/incidents" });
}
