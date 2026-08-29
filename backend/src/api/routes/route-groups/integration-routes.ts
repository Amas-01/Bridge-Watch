import type { FastifyInstance } from "fastify";
import { webhooksRoutes } from "../webhooks.js";
import { oauth2Routes } from "../oauth2.js";
import { discordRoutes } from "../discord.routes.js";
import { statusSubscriptionsRoutes } from "../statusSubscriptions.js";
import { eventSubscriptionFilterRoutes } from "../eventSubscriptionFilter.routes.js";

export async function registerIntegrationRoutes(server: FastifyInstance): Promise<void> {
  server.register(webhooksRoutes, { prefix: "/api/v1/webhooks" });
  server.register(oauth2Routes, { prefix: "/api/v1/oauth" });
  server.register(discordRoutes, { prefix: "/api/v1/discord" });
  server.register(statusSubscriptionsRoutes, {
    prefix: "/api/v1/status-subscriptions",
  });
  server.register(eventSubscriptionFilterRoutes, {
    prefix: "/api/v1/event-subscriptions",
  });
}
