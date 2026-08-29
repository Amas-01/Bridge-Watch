import type { FastifyInstance } from "fastify";
import { automationRulesRoutes } from "../automationRules.routes.js";
import { ruleEvaluatorRoutes } from "../ruleEvaluator.routes.js";
import { playbooksRoutes } from "../playbooks.routes.js";
import { cleanupRoutes } from "../cleanup.routes.js";
import { maintenanceRoutes } from "../maintenance.js";

export async function registerAutomationRoutes(server: FastifyInstance): Promise<void> {
  server.register(automationRulesRoutes, { prefix: "/api/v1/automation-rules" });
  server.register(ruleEvaluatorRoutes, { prefix: "/api/v1/rule-evaluator" });
  server.register(playbooksRoutes, { prefix: "/api/v1/playbooks" });
  server.register(cleanupRoutes, { prefix: "/api/v1/cleanup" });
  server.register(maintenanceRoutes, { prefix: "/api/v1/maintenance" });
}
