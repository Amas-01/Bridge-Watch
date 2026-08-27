import type { FastifyInstance } from "fastify";
import { analyticsRoutes } from "../analytics.js";
import { metricsRoutes } from "../metrics.js";
import { metricsAggregationRoutes } from "../metricsAggregation.routes.js";
import { savedMetricsRoutes } from "../savedMetrics.routes.js";
import { externalRateLimitMetricsRoutes } from "../externalRateLimitMetrics.routes.js";
import { performanceBaselineRoutes } from "../performanceBaseline.routes.js";
import { sorobanInvocationCostRoutes } from "../sorobanInvocationCost.routes.js";
import { correlationAnalysisRoutes } from "../correlationAnalysis.routes.js";
import { txFeeForecastHistoryRoutes } from "../txFeeForecastHistory.routes.js";

export async function registerAnalyticsRoutes(server: FastifyInstance): Promise<void> {
  server.register(analyticsRoutes, { prefix: "/api/v1/analytics" });
  server.register(metricsRoutes, { prefix: "/metrics" });
  server.register(metricsAggregationRoutes, {
    prefix: "/api/v1/metrics/aggregation",
  });
  server.register(savedMetricsRoutes, { prefix: "/api/v1/analytics/saved-metrics" });
  server.register(externalRateLimitMetricsRoutes, {
    prefix: "/api/v1/metrics/external-rate-limits",
  });
  server.register(performanceBaselineRoutes, {
    prefix: "/api/v1/performance-baselines",
  });
  server.register(sorobanInvocationCostRoutes, {
    prefix: "/api/v1/soroban/cost-tracking",
  });
  server.register(correlationAnalysisRoutes, {
    prefix: "/api/v1/analytics/correlation",
  });
  server.register(txFeeForecastHistoryRoutes, {
    prefix: "/api/v1/analytics/fee-forecast",
  });
}
