import type { FastifyInstance } from "fastify";
import { alertsRoutes } from "../alerts.routes.js";
import { alertHistoryRoutes } from "../alertHistory.routes.js";
import { alertRulesRoutes } from "../alertRules.js";
import { alertSuppressionRoutes } from "../alertSuppression.js";
import { alertWindowingRoutes } from "../alertWindowing.routes.js";
import { alertEscalationRoutes } from "../alertEscalation.routes.js";
import { duplicateAlertCheckRoutes } from "../duplicateAlertCheck.routes.js";
import { alertRoutingAdminRoutes } from "../alertRoutingAdmin.js";
import { alertNoiseReductionRoutes } from "../alertNoiseReduction.routes.js";
import { alertReplayExportRoutes } from "../alertReplayExport.routes.js";
import { alertRuleDependencyGraphRoutes } from "../alertRuleDependencyGraph.routes.js";

export async function registerAlertRoutes(server: FastifyInstance): Promise<void> {
  server.register(alertsRoutes, { prefix: "/api/v1/alerts" });
  server.register(alertHistoryRoutes, { prefix: "/api/v1/alerts/search" });
  server.register(alertRulesRoutes, { prefix: "/api/v1/alert-rules" });
  server.register(alertSuppressionRoutes, {
    prefix: "/api/v1/alert-suppression",
  });
  server.register(alertWindowingRoutes, { prefix: "/api/v1/alert-windowing" });
  server.register(alertEscalationRoutes, {
    prefix: "/api/v1/alert-escalation",
  });
  server.register(duplicateAlertCheckRoutes, {
    prefix: "/api/v1/duplicate-alert-check",
  });
  server.register(alertRoutingAdminRoutes, {
    prefix: "/api/v1/admin/alert-routing",
  });
  server.register(alertNoiseReductionRoutes, {
    prefix: "/api/v1/alert-noise-reduction",
  });
  server.register(alertReplayExportRoutes, {
    prefix: "/api/v1/alerts/replay-export",
  });
  server.register(alertRuleDependencyGraphRoutes, {
    prefix: "/api/v1/alert-rules/dependency-graph",
  });
}
