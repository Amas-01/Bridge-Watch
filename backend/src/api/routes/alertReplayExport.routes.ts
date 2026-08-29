import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { alertReplayExportService } from "../../services/alertReplayExport.service.js";
import { authMiddleware } from "../middleware/auth.js";

export async function alertReplayExportRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authMiddleware());

  server.post(
    "/",
    {
      schema: {
        tags: ["Alert Replay Export"],
        summary: "Create a historical alert replay export",
        body: {
          type: "object",
          required: ["ownerAddress"],
          properties: {
            ownerAddress: { type: "string" },
            filter: {
              type: "object",
              properties: {
                assetCode: { type: "string" },
                alertType: { type: "string" },
                priority: { type: "string" },
                startDate: { type: "string", format: "date-time" },
                endDate: { type: "string", format: "date-time" },
                ruleId: { type: "string", format: "uuid" },
              },
            },
            format: { type: "string", enum: ["csv", "json"], default: "csv" },
          },
        },
        response: { 201: { type: "object", properties: { export: { type: "object" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { ownerAddress: string; filter?: Record<string, unknown>; format?: "csv" | "json" };
      const result = await alertReplayExportService.createExport(body.ownerAddress, body.filter ?? {}, body.format);
      return reply.status(201).send({ export: result });
    },
  );

  server.get(
    "/",
    {
      schema: {
        tags: ["Alert Replay Export"],
        summary: "List alert replay exports for an owner",
        querystring: {
          type: "object",
          required: ["owner"],
          properties: {
            owner: { type: "string" },
            limit: { type: "integer", default: 20 },
            offset: { type: "integer", default: 0 },
          },
        },
        response: { 200: { type: "object", properties: { exports: { type: "array" }, total: { type: "integer" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { owner, limit, offset } = request.query as { owner: string; limit?: number; offset?: number };
      const result = await alertReplayExportService.listExports(owner, limit, offset);
      return reply.send(result);
    },
  );

  server.get(
    "/:id",
    {
      schema: {
        tags: ["Alert Replay Export"],
        summary: "Get a single alert replay export",
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
        response: { 200: { type: "object", properties: { export: { type: "object" } } }, 404: { type: "object" } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await alertReplayExportService.getExport(id);
      if (!result) return reply.status(404).send({ error: "Export not found" });
      return reply.send({ export: result });
    },
  );

  server.get(
    "/:id/events",
    {
      schema: {
        tags: ["Alert Replay Export"],
        summary: "Get events for an alert replay export",
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
        response: { 200: { type: "object", properties: { events: { type: "array" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const events = await alertReplayExportService.getExportEvents(id);
      return reply.send({ events });
    },
  );

  server.delete(
    "/:id",
    {
      schema: {
        tags: ["Alert Replay Export"],
        summary: "Delete an alert replay export",
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
        response: { 204: { type: "null" } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      await alertReplayExportService.deleteExport(id);
      return reply.status(204).send();
    },
  );
}
