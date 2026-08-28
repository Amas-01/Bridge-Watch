import type { FastifyInstance } from "fastify";
import { transactionsRoutes } from "../transactions.js";
import { balanceRoutes } from "../balances.js";
import { supplyChainRoutes } from "../supplyChain.js";
import { archivedDataBrowserRoutes } from "../archivedDataBrowser.routes.js";
import { freshnessRoutes } from "../freshness.js";
import { provenanceRoutes } from "../provenance.routes.js";
// #1152 — Transaction Address Labeling Service
import { addressLabelsRoutes } from "../addressLabels.routes.js";

export async function registerDataRoutes(server: FastifyInstance): Promise<void> {
  server.register(transactionsRoutes, { prefix: "/api/v1/transactions" });
  server.register(balanceRoutes, { prefix: "/api/v1/balances" });
  server.register(supplyChainRoutes, { prefix: "/api/v1/supply-chain" });
  server.register(archivedDataBrowserRoutes, { prefix: "/api/v1/archive" });
  server.register(freshnessRoutes, { prefix: "/api/v1/freshness" });
  server.register(provenanceRoutes, { prefix: "/api/v1/provenance" });

  // #1152 — Transaction Address Labeling Service
  server.register(addressLabelsRoutes, { prefix: "/api/v1/address-labels" });
}
