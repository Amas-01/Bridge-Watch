import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { LoginRiskSignalService } from "../../services/loginRiskSignal.service.js";
import { authMiddleware } from "../middleware/auth.js";

export async function loginRiskSignalsRoutes(server: FastifyInstance) {
  const service = new LoginRiskSignalService();

  server.addHook("preHandler", authMiddleware());

  server.get<{ Querystring: { userAddress: string } }>(
    "/signals",
    {
      schema: {
        tags: ["Login Risk Signals"],
        summary: "Get login risk signals for user",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          required: ["userAddress"],
          properties: { userAddress: { type: "string" } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userAddress } = request.query as { userAddress: string };
      const signals = await service.getSignalsForUser(userAddress);
      reply.send({ signals });
    }
  );

  server.get(
    "/active-signals",
    {
      schema: {
        tags: ["Login Risk Signals"],
        summary: "Get active high-risk signals",
        security: [{ ApiKeyAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const signals = await service.getActiveSignals("high");
      reply.send({ signals });
    }
  );

  server.post<{
    Body: {
      userAddress: string;
      signalType: string;
      riskLevel: string;
      metadata?: Record<string, unknown>;
    };
  }>(
    "/signals",
    {
      schema: {
        tags: ["Login Risk Signals"],
        summary: "Create login risk signal",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["userAddress", "signalType", "riskLevel"],
          properties: {
            userAddress: { type: "string" },
            signalType: { type: "string" },
            riskLevel: { type: "string", enum: ["critical", "high", "medium", "low"] },
            metadata: { type: "object" },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { userAddress, signalType, riskLevel, metadata } = request.body;
      const signal = await service.createSignal(userAddress, signalType as any, riskLevel as any, metadata);
      reply.code(201).send({ signal });
    }
  );

  server.post<{ Params: { id: string } }>(
    "/signals/:id/resolve",
    {
      schema: {
        tags: ["Login Risk Signals"],
        summary: "Resolve login risk signal",
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const signal = await service.resolveSignal(id);
      reply.send({ signal });
    }
  );
}
