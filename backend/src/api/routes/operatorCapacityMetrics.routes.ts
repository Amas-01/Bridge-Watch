import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { operatorCapacityMetricsService } from "../../services/operatorCapacityMetrics.service.js";
import { authMiddleware } from "../middleware/auth.js";

export async function operatorCapacityMetricsRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authMiddleware());

  server.post(
    "/snapshots",
    {
      schema: {
        tags: ["Operator Capacity Metrics"],
        summary: "Record a capacity snapshot for an operator",
        body: {
          type: "object",
          required: ["operatorAddress", "bridgeId", "maxCapacity", "currentUtilization"],
          properties: {
            operatorAddress: { type: "string" },
            bridgeId: { type: "string" },
            maxCapacity: { type: "number" },
            currentUtilization: { type: "number" },
            metadata: { type: "object" },
          },
        },
        response: { 201: { type: "object", properties: { snapshot: { type: "object" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        operatorAddress: string;
        bridgeId: string;
        maxCapacity: number;
        currentUtilization: number;
        metadata?: Record<string, unknown>;
      };
      const snapshot = await operatorCapacityMetricsService.recordSnapshot(
        body.operatorAddress,
        body.bridgeId,
        body.maxCapacity,
        body.currentUtilization,
        body.metadata,
      );
      return reply.status(201).send({ snapshot });
    },
  );

  server.get(
    "/snapshots/latest",
    {
      schema: {
        tags: ["Operator Capacity Metrics"],
        summary: "Get latest capacity snapshot for an operator/bridge",
        querystring: {
          type: "object",
          required: ["operatorAddress", "bridgeId"],
          properties: { operatorAddress: { type: "string" }, bridgeId: { type: "string" } },
        },
        response: { 200: { type: "object", properties: { snapshot: { type: ["object", "null"] } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { operatorAddress, bridgeId } = request.query as { operatorAddress: string; bridgeId: string };
      const snapshot = await operatorCapacityMetricsService.getLatestSnapshot(operatorAddress, bridgeId);
      return reply.send({ snapshot });
    },
  );

  server.get(
    "/snapshots",
    {
      schema: {
        tags: ["Operator Capacity Metrics"],
        summary: "List capacity snapshots",
        querystring: {
          type: "object",
          properties: {
            operatorAddress: { type: "string" },
            bridgeId: { type: "string" },
            limit: { type: "integer", default: 50 },
            offset: { type: "integer", default: 0 },
          },
        },
        response: { 200: { type: "object", properties: { snapshots: { type: "array" }, total: { type: "integer" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { operatorAddress, bridgeId, limit, offset } = request.query as {
        operatorAddress?: string;
        bridgeId?: string;
        limit?: number;
        offset?: number;
      };
      const result = await operatorCapacityMetricsService.getSnapshots(operatorAddress, bridgeId, limit, offset);
      return reply.send(result);
    },
  );

  server.get(
    "/summary",
    {
      schema: {
        tags: ["Operator Capacity Metrics"],
        summary: "Get operator capacity summary",
        querystring: {
          type: "object",
          required: ["operatorAddress"],
          properties: { operatorAddress: { type: "string" } },
        },
        response: { 200: { type: "object", properties: { summary: { type: "object" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { operatorAddress } = request.query as { operatorAddress: string };
      const summary = await operatorCapacityMetricsService.getOperatorSummary(operatorAddress);
      return reply.send({ summary });
    },
  );

  server.post(
    "/alerts",
    {
      schema: {
        tags: ["Operator Capacity Metrics"],
        summary: "Create a capacity alert",
        body: {
          type: "object",
          required: ["ownerAddress", "operatorAddress", "bridgeId", "condition", "thresholdPct"],
          properties: {
            ownerAddress: { type: "string" },
            operatorAddress: { type: "string" },
            bridgeId: { type: "string" },
            condition: { type: "string", enum: ["gte", "lte", "gt", "lt"] },
            thresholdPct: { type: "number" },
          },
        },
        response: { 201: { type: "object", properties: { alert: { type: "object" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        ownerAddress: string;
        operatorAddress: string;
        bridgeId: string;
        condition: string;
        thresholdPct: number;
      };
      const alert = await operatorCapacityMetricsService.createAlert(
        body.ownerAddress,
        body.operatorAddress,
        body.bridgeId,
        body.condition,
        body.thresholdPct,
      );
      return reply.status(201).send({ alert });
    },
  );

  server.get(
    "/alerts",
    {
      schema: {
        tags: ["Operator Capacity Metrics"],
        summary: "List capacity alerts for an owner",
        querystring: {
          type: "object",
          required: ["owner"],
          properties: { owner: { type: "string" } },
        },
        response: { 200: { type: "object", properties: { alerts: { type: "array" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { owner } = request.query as { owner: string };
      const alerts = await operatorCapacityMetricsService.listAlerts(owner);
      return reply.send({ alerts });
    },
  );
}
