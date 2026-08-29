import type { FastifyInstance } from "fastify";
import { canaryMetricService } from "../../services/canaryMetric.service.js";

interface CreateDeploymentBody {
  deploymentName: string;
  version: string;
  environment: string;
  config: Record<string, unknown>;
  trafficPercentage?: number;
  baselineVersion?: string;
}

interface RecordMetricBody {
  metricName: string;
  metricType: string;
  canaryValue: number;
  baselineValue: number;
  thresholdPct?: number;
}

export async function canaryMetricRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateDeploymentBody }>("/api/v1/canary/deployments", async (request, reply) => {
    try {
      const deployment = await canaryMetricService.createDeployment(
        request.body.deploymentName,
        request.body.version,
        request.body.environment,
        request.body.config,
        request.body.trafficPercentage,
        request.body.baselineVersion
      );
      return reply.code(201).send(deployment);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get("/api/v1/canary/deployments", async (request, reply) => {
    try {
      const { environment, status } = request.query as Record<string, string>;
      const deployments = await canaryMetricService.listDeployments(environment, status);
      return reply.send(deployments);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get<{ Params: { id: string } }>("/api/v1/canary/deployments/:id", async (request, reply) => {
    try {
      const deployment = await canaryMetricService.getDeployment(request.params.id);
      if (!deployment) {
        return reply.code(404).send({ error: "Deployment not found" });
      }
      return reply.send(deployment);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.post<{ Params: { deploymentId: string }; Body: RecordMetricBody }>(
    "/api/v1/canary/deployments/:deploymentId/metrics",
    async (request, reply) => {
      try {
        const metric = await canaryMetricService.recordMetric(
          request.params.deploymentId,
          request.body.metricName,
          request.body.metricType,
          request.body.canaryValue,
          request.body.baselineValue,
          request.body.thresholdPct
        );
        return reply.code(201).send(metric);
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  app.get<{ Params: { deploymentId: string } }>("/api/v1/canary/deployments/:deploymentId/metrics", async (request, reply) => {
    try {
      const metrics = await canaryMetricService.getMetrics(request.params.deploymentId);
      return reply.send(metrics);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get<{ Params: { deploymentId: string } }>("/api/v1/canary/deployments/:deploymentId/comparison", async (request, reply) => {
    try {
      const comparison = await canaryMetricService.getComparison(request.params.deploymentId);
      if (!comparison) {
        return reply.code(404).send({ error: "Comparison not found" });
      }
      return reply.send(comparison);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.post<{ Params: { deploymentId: string }; Body: { status: "completed" | "failed" | "aborted" } }>(
    "/api/v1/canary/deployments/:deploymentId/complete",
    async (request, reply) => {
      try {
        const deployment = await canaryMetricService.completeDeployment(request.params.deploymentId, request.body.status);
        return reply.send(deployment);
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );
}
