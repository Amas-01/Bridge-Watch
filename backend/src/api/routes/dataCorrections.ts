import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { DataCorrectionService } from "../../services/dataCorrection.service.js";
import { authMiddleware } from "../middleware/auth.js";

export async function dataCorrectionsRoutes(server: FastifyInstance) {
  const service = new DataCorrectionService();

  server.addHook("preHandler", authMiddleware());

  server.get(
    "/pending",
    {
      schema: {
        tags: ["Data Corrections"],
        summary: "Get pending corrections",
        security: [{ ApiKeyAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const corrections = await service.getPendingCorrections();
      reply.send({ corrections });
    }
  );

  server.get<{ Querystring: { requesterAddress: string } }>(
    "/",
    {
      schema: {
        tags: ["Data Corrections"],
        summary: "Get corrections for requester",
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: "object",
          required: ["requesterAddress"],
          properties: { requesterAddress: { type: "string" } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { requesterAddress } = request.query as { requesterAddress: string };
      const corrections = await service.getCorrectionsForRequester(requesterAddress);
      reply.send({ corrections });
    }
  );

  server.post<{
    Body: {
      requesterAddress: string;
      dataType: string;
      entityId: string;
      originalData: Record<string, unknown>;
      correctedData: Record<string, unknown>;
      reason: string;
    };
  }>(
    "/",
    {
      schema: {
        tags: ["Data Corrections"],
        summary: "Create correction request",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["requesterAddress", "dataType", "entityId", "originalData", "correctedData", "reason"],
          properties: {
            requesterAddress: { type: "string" },
            dataType: { type: "string" },
            entityId: { type: "string" },
            originalData: { type: "object" },
            correctedData: { type: "object" },
            reason: { type: "string" },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { requesterAddress, dataType, entityId, originalData, correctedData, reason } = request.body;
      const correction = await service.createCorrection(
        requesterAddress,
        dataType,
        entityId,
        originalData,
        correctedData,
        reason
      );
      reply.code(201).send({ correction });
    }
  );

  server.post<{
    Params: { id: string };
    Body: { approverAddress: string };
  }>(
    "/:id/approve",
    {
      schema: {
        tags: ["Data Corrections"],
        summary: "Approve correction request",
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          required: ["approverAddress"],
          properties: { approverAddress: { type: "string" } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { approverAddress } = request.body;
      const correction = await service.approveCorrection(id, approverAddress);
      reply.send({ correction });
    }
  );

  server.post<{
    Params: { id: string };
    Body: { rejectionReason: string };
  }>(
    "/:id/reject",
    {
      schema: {
        tags: ["Data Corrections"],
        summary: "Reject correction request",
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
        body: {
          type: "object",
          required: ["rejectionReason"],
          properties: { rejectionReason: { type: "string" } },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const { rejectionReason } = request.body;
      const correction = await service.rejectCorrection(id, rejectionReason);
      reply.send({ correction });
    }
  );
}
