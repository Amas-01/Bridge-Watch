import type { FastifyInstance } from "fastify";
import { priceFeedsRoutes } from "../priceFeeds.js";

export async function registerPriceRoutes(server: FastifyInstance): Promise<void> {
  server.register(priceFeedsRoutes, { prefix: "/api/v1/price-feeds" });
}
