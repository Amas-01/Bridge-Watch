import type { FastifyInstance } from "fastify";
import { compatibilityRoutes } from "../../compatibility/routes.js";

export async function registerCompatibilityRoutes(server: FastifyInstance): Promise<void> {
  server.register(compatibilityRoutes, { prefix: "/api/v1/compatibility" });
}
