import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { queryPerformanceService } from "../../services/queryPerformance.service.js";

interface LogQueryBody {
  queryHash: string;
  queryText: string;
  databaseName: string;
  executionTimeMs: number;
  rowsAffected?: number;
  rowsScanned?: number;
  status?: "success" | "failed" | "timeout" | "slow";
  errorMessage?: string;
}

interface QueryParams {
  queryHash: string;
}

interface ListQuery {
  limit?: string;
  offset?: string;
}

export async function queryPerformanceRoutes(server: FastifyInstance) {
  // Log query execution
  server.post<{ Body: LogQueryBody }>(
    "/log",
    async (request: FastifyRequest<{ Body: LogQueryBody }>, reply: FastifyReply) => {
      try {
        const { queryHash, queryText, databaseName, executionTimeMs, rowsAffected, rowsScanned, status, errorMessage } = request.body;

        if (!queryHash || !queryText || !databaseName || executionTimeMs === undefined) {
          return reply.code(400).send({ error: "queryHash, queryText, databaseName, and executionTimeMs are required" });
        }

        const log = await queryPerformanceService.logQueryExecution(
          queryHash,
          queryText,
          databaseName,
          executionTimeMs,
          rowsAffected || 0,
          rowsScanned || 0,
          status || "success",
          errorMessage
        );

        return reply.code(201).send(log);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to log query execution";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Analyze a specific query
  server.get<{ Params: QueryParams }>(
    "/analyze/:queryHash",
    async (request: FastifyRequest<{ Params: QueryParams }>, reply: FastifyReply) => {
      try {
        const analysis = await queryPerformanceService.analyzeQuery(request.params.queryHash);
        return reply.send(analysis);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to analyze query";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get all slow queries
  server.get<{ Querystring: ListQuery }>(
    "/slow",
    async (request: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

        const queries = await queryPerformanceService.getSlowQueries(limit, offset);
        return reply.send({ queries, limit, offset, total: queries.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch slow queries";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Create a slow query alert
  server.post<{
    Body: {
      queryHash: string;
      alertType: "performance_degradation" | "threshold_breach" | "regression_detected";
      severity: "low" | "medium" | "high" | "critical";
      thresholdMs: number;
      currentMs: number;
      description: string;
    };
  }>(
    "/alerts",
    async (
      request: FastifyRequest<{
        Body: {
          queryHash: string;
          alertType: "performance_degradation" | "threshold_breach" | "regression_detected";
          severity: "low" | "medium" | "high" | "critical";
          thresholdMs: number;
          currentMs: number;
          description: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { queryHash, alertType, severity, thresholdMs, currentMs, description } = request.body;

        if (!queryHash || !alertType || !severity || thresholdMs === undefined || currentMs === undefined) {
          return reply.code(400).send({ error: "All required fields must be provided" });
        }

        const alert = await queryPerformanceService.createSlowQueryAlert(queryHash, alertType, severity, thresholdMs, currentMs, description);
        return reply.code(201).send(alert);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create alert";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get active alerts
  server.get<{ Querystring: ListQuery }>(
    "/alerts",
    async (request: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;

        const alerts = await queryPerformanceService.getActiveAlerts(limit, offset);
        return reply.send({ alerts, limit, offset });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch alerts";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Resolve an alert
  server.post<{ Params: { alertId: string } }>(
    "/alerts/:alertId/resolve",
    async (request: FastifyRequest<{ Params: { alertId: string } }>, reply: FastifyReply) => {
      try {
        await queryPerformanceService.resolveAlert(request.params.alertId);
        return reply.send({ status: "resolved" });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to resolve alert";
        return reply.code(400).send({ error: message });
      }
    }
  );
}
