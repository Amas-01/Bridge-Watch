import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { correlationAnalysisService } from "../../services/correlationAnalysis.service.js";
import { authMiddleware } from "../middleware/auth.js";

export async function correlationAnalysisRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authMiddleware());

  server.post(
    "/compute",
    {
      schema: {
        tags: ["Correlation Analysis"],
        summary: "Compute correlation between two assets",
        body: {
          type: "object",
          required: ["assetA", "assetB"],
          properties: {
            assetA: { type: "string" },
            assetB: { type: "string" },
            period: { type: "string", enum: ["1h", "4h", "1d", "7d"], default: "1d" },
          },
        },
        response: { 200: { type: "object", properties: { correlation: { type: "object" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { assetA, assetB, period } = request.body as { assetA: string; assetB: string; period?: "1h" | "4h" | "1d" | "7d" };
      const result = await correlationAnalysisService.computeCorrelation(assetA, assetB, period ?? "1d");
      return reply.send({ correlation: result });
    },
  );

  server.get(
    "/latest",
    {
      schema: {
        tags: ["Correlation Analysis"],
        summary: "Get latest correlation between two assets",
        querystring: {
          type: "object",
          required: ["assetA", "assetB", "period"],
          properties: { assetA: { type: "string" }, assetB: { type: "string" }, period: { type: "string" } },
        },
        response: { 200: { type: "object", properties: { correlation: { type: ["object", "null"] } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { assetA, assetB, period } = request.query as { assetA: string; assetB: string; period: string };
      const result = await correlationAnalysisService.getLatestCorrelation(assetA, assetB, period);
      return reply.send({ correlation: result });
    },
  );

  server.get(
    "/matrix",
    {
      schema: {
        tags: ["Correlation Analysis"],
        summary: "Get correlation matrix for multiple assets",
        querystring: {
          type: "object",
          required: ["assets", "period"],
          properties: { assets: { type: "string", description: "Comma-separated asset codes" }, period: { type: "string" } },
        },
        response: { 200: { type: "object", properties: { matrix: { type: "object" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { assets, period } = request.query as { assets: string; period: string };
      const assetList = assets.split(",").map((a) => a.trim());
      const matrix = await correlationAnalysisService.getCorrelationMatrix(assetList, period);
      return reply.send({ matrix });
    },
  );

  server.post(
    "/alerts",
    {
      schema: {
        tags: ["Correlation Analysis"],
        summary: "Create a correlation alert",
        body: {
          type: "object",
          required: ["ownerAddress", "assetA", "assetB", "condition", "threshold"],
          properties: {
            ownerAddress: { type: "string" },
            assetA: { type: "string" },
            assetB: { type: "string" },
            condition: { type: "string", enum: ["above", "below"] },
            threshold: { type: "number" },
          },
        },
        response: { 201: { type: "object", properties: { alert: { type: "object" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as { ownerAddress: string; assetA: string; assetB: string; condition: string; threshold: number };
      const alert = await correlationAnalysisService.createAlert(body.ownerAddress, body.assetA, body.assetB, body.condition, body.threshold);
      return reply.status(201).send({ alert });
    },
  );

  server.get(
    "/alerts",
    {
      schema: {
        tags: ["Correlation Analysis"],
        summary: "List correlation alerts for an owner",
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
      const alerts = await correlationAnalysisService.listAlerts(owner);
      return reply.send({ alerts });
    },
  );
}
