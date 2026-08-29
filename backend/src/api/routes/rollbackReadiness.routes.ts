import type { FastifyInstance } from "fastify";
import { rollbackReadinessService } from "../../services/rollbackReadiness.service.js";

interface CreateCheckBody {
  deploymentId: string;
  checkType: string;
  criteria: Record<string, unknown>;
}

interface ExecuteCheckBody {
  result: Record<string, unknown>;
  passed: boolean;
  failureReason?: string;
}

interface InitiateRollbackBody {
  initiatedBy: string;
  reason?: string;
  config?: Record<string, unknown>;
}

export async function rollbackReadinessRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateCheckBody }>("/api/v1/rollback/checks", async (request, reply) => {
    try {
      const check = await rollbackReadinessService.createCheck(
        request.body.deploymentId,
        request.body.checkType,
        request.body.criteria
      );
      return reply.code(201).send(check);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.post<{ Params: { id: string }; Body: ExecuteCheckBody }>("/api/v1/rollback/checks/:id/execute", async (request, reply) => {
    try {
      const check = await rollbackReadinessService.executeCheck(
        request.params.id,
        request.body.result,
        request.body.passed,
        request.body.failureReason
      );
      return reply.send(check);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get<{ Params: { deploymentId: string } }>("/api/v1/rollback/deployments/:deploymentId/summary", async (request, reply) => {
    try {
      const summary = await rollbackReadinessService.getSummary(request.params.deploymentId);
      if (!summary) {
        return reply.code(404).send({ error: "Summary not found" });
      }
      return reply.send(summary);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get<{ Params: { deploymentId: string } }>("/api/v1/rollback/deployments/:deploymentId/checks", async (request, reply) => {
    try {
      const checks = await rollbackReadinessService.getChecks(request.params.deploymentId);
      return reply.send(checks);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.post<{ Body: InitiateRollbackBody }>("/api/v1/rollback/initiate", async (request, reply) => {
    try {
      const deploymentId = (request.query as Record<string, string>).deploymentId;
      if (!deploymentId) {
        return reply.code(400).send({ error: "deploymentId query parameter required" });
      }

      const execution = await rollbackReadinessService.initiateRollback(
        deploymentId,
        request.body.initiatedBy,
        request.body.reason,
        request.body.config
      );
      return reply.code(201).send(execution);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.post<{ Params: { id: string }; Body: { status: "completed" | "failed"; durationSeconds?: number } }>(
    "/api/v1/rollback/executions/:id/complete",
    async (request, reply) => {
      try {
        const execution = await rollbackReadinessService.completeRollback(
          request.params.id,
          request.body.status,
          request.body.durationSeconds
        );
        return reply.send(execution);
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  app.get<{ Params: { deploymentId: string } }>("/api/v1/rollback/deployments/:deploymentId/history", async (request, reply) => {
    try {
      const history = await rollbackReadinessService.getRollbackHistory(request.params.deploymentId);
      return reply.send(history);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });
}
