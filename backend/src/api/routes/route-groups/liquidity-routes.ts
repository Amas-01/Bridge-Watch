import type { FastifyInstance } from "fastify";
import { dexPoolDiscoveryRoutes } from "../dexPoolDiscovery.routes.js";
import { poolQualityRankingRoutes } from "../poolQualityRanking.routes.js";
import { marketImpactPresetsRoutes } from "../marketImpactPresets.routes.js";
import { routeQuoteRoutes } from "../routeQuote.routes.js";

export async function registerLiquidityRoutes(server: FastifyInstance): Promise<void> {
  // #1157 — DEX pool discovery refresh
  server.register(dexPoolDiscoveryRoutes, {
    prefix: "/api/v1/liquidity/pool-discovery",
  });
  // #1158 — Liquidity pool quality ranking
  server.register(poolQualityRankingRoutes, {
    prefix: "/api/v1/liquidity/pool-quality",
  });
  // #1159 — Market impact scenario presets
  server.register(marketImpactPresetsRoutes, {
    prefix: "/api/v1/liquidity/market-impact-presets",
  });
  // #1160 — Route quote expiration handling
  server.register(routeQuoteRoutes, { prefix: "/api/v1/liquidity/route-quotes" });
}
