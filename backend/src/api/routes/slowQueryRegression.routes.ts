import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { slowQueryRegressionService } from "../../services/slowQueryRegression.service.js";

interface CreateBaselineBody {
  queryName: string;
  baselineMs: number;
  varianceThreshold?: number;
}

interface RecordObservationBody {
  baselineId: string;
  executionMs: number;
  queryDetails?: string;
}

interface UpdateBaselineBody {
  baselineMs?: number;
  varianceThreshold?: number;
}

export async function slowQueryRegressionRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateBaselineBody }>("/api/v1/slow-queries/baseline", async (request, reply) => {
    try {
      const baseline = await slowQueryRegressionService.createBaseline(
        request.body.queryName,
        request.body.baselineMs,
        request.body.varianceThreshold
      );
      return reply.code(201).send(baseline);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get("/api/v1/slow-queries/baseline", async (request, reply) => {
    try {
      const status = (request.query as Record<string, string>).status;
      const baselines = await slowQueryRegressionService.listBaselines(status);
      return reply.send(baselines);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get<{ Params: { id: string } }>("/api/v1/slow-queries/baseline/:id", async (request, reply) => {
    try {
      const baseline = await slowQueryRegressionService.getBaseline(request.params.id);
      if (!baseline) {
        return reply.code(404).send({ error: "Baseline not found" });
      }
      return reply.send(baseline);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.patch<{ Params: { id: string }; Body: UpdateBaselineBody }>(
    "/api/v1/slow-queries/baseline/:id",
    async (request, reply) => {
      try {
        const baseline = await slowQueryRegressionService.updateBaseline(
          request.params.id,
          request.body.baselineMs,
          request.body.varianceThreshold
        );
        return reply.send(baseline);
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  app.post<{ Body: RecordObservationBody }>("/api/v1/slow-queries/observations", async (request, reply) => {
    try {
      const observation = await slowQueryRegressionService.recordObservation(
        request.body.baselineId,
        request.body.executionMs,
        request.body.queryDetails
      );
      return reply.code(201).send(observation);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get("/api/v1/slow-queries/alerts", async (request, reply) => {
    try {
      const alerts = await slowQueryRegressionService.getActiveAlerts();
      return reply.send(alerts);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.post<{ Params: { id: string } }>("/api/v1/slow-queries/alerts/:id/resolve", async (request, reply) => {
    try {
      const alert = await slowQueryRegressionService.resolveAlert(request.params.id);
      return reply.send(alert);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.post<{ Params: { id: string } }>("/api/v1/slow-queries/baseline/:id/disable", async (request, reply) => {
    try {
      const baseline = await slowQueryRegressionService.disableBaseline(request.params.id);
      return reply.send(baseline);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });
}
