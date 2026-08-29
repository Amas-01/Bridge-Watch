import type { FastifyInstance } from "fastify";
import { reconciliationRoutes } from "../reconciliation.js";
import { batchReconciliationRoutes } from "../batchReconciliation.routes.js";
import { mmrVerificationRoutes } from "../mmrVerification.routes.js";

export async function registerReconciliationRoutes(server: FastifyInstance): Promise<void> {
  server.register(reconciliationRoutes, { prefix: "/api/v1/reconciliation" });
  server.register(batchReconciliationRoutes, {
    prefix: "/api/v1/reconciliation/batch",
  });
  server.register(mmrVerificationRoutes, {
    prefix: "/api/v1/reconciliation",
  });
}
