import type { FastifyInstance } from "fastify";
import { providerHealthRegistryRoutes } from "../providerHealthRegistry.routes.js";
import { providerAllowlistRoutes } from "../providerAllowlist.routes.js";
import { providerCircuitBreakerRoutes } from "../providerCircuitBreaker.routes.js";
import { bftOracleRoutes } from "../bftOracle.routes.js";
import { providerLatencyRoutes } from "../providerLatency.routes.js";

export async function registerProviderRoutes(server: FastifyInstance): Promise<void> {
  server.register(providerHealthRegistryRoutes, {
    prefix: "/api/v1/providers/health",
  });
  server.register(providerAllowlistRoutes, {
    prefix: "/api/v1/providers/allowlist",
  });
  server.register(providerCircuitBreakerRoutes, {
    prefix: "/api/v1/providers/circuit-breaker",
  });
  server.register(bftOracleRoutes, {
    prefix: "/api/v1/bft-oracle",
  });
  server.register(providerLatencyRoutes, {
    prefix: "/api/v1/provider-latency",
  });
}

