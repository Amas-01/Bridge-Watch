import type { FastifyInstance } from "fastify";
import { bridgesRoutes } from "../bridges.js";
import { bridgeRegistryRoutes } from "../bridge-registry.routes.js";
import { poolRoutes } from "../pools.routes.js";
import { crossChainVerificationRoutes } from "../crossChainVerification.routes.js";
import { transferSLARoutes } from "../transferSLA.routes.js";
import { sorobanBatchPlannerRoutes } from "../sorobanBatchPlanner.routes.js";
// #1149 — Bridge Comparison Report
import { bridgeComparisonReportRoutes } from "../bridgeComparisonReport.routes.js";

export async function registerBridgeRoutes(server: FastifyInstance): Promise<void> {
  server.register(bridgesRoutes, { prefix: "/api/v1/bridges" });
  server.register(bridgeRegistryRoutes, { prefix: "/api/v1/bridge-registry" });
  server.register(poolRoutes, { prefix: "/api/v1/pools" });
  server.register(crossChainVerificationRoutes, {
    prefix: "/api/v1/cross-chain-verification",
  });
  server.register(transferSLARoutes, { prefix: "/api/v1/transfer-sla" });
  server.register(sorobanBatchPlannerRoutes, {
    prefix: "/api/v1/soroban/batch-planner",
  });

  // #1149 — Bridge Comparison Report
  server.register(bridgeComparisonReportRoutes, {
    prefix: "/api/v1/bridge-comparison-report",
  });
}
