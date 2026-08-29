import type { FastifyInstance } from "fastify";
import { promotionGatesService } from "../../services/promotionGates.service.js";

interface CreateGateBody {
  sourceEnvironment: string;
  targetEnvironment: string;
  gateName: string;
  gateType: string;
  criteria: Record<string, unknown>;
  requiredApprovals?: number;
  approvalRoles?: string;
}

interface RequestPromotionBody {
  deploymentId: string;
  version: string;
  sourceEnvironment: string;
  targetEnvironment: string;
}

interface ExecuteGateBody {
  gateId: string;
  passed: boolean;
  result?: Record<string, unknown>;
  durationMs?: number;
}

interface ApprovePromotionBody {
  approverId: string;
  comment?: string;
}

interface DenyPromotionBody {
  approverId: string;
  reason: string;
}

export async function promotionGatesRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateGateBody }>("/api/v1/promotion-gates", async (request, reply) => {
    try {
      const gate = await promotionGatesService.createGate(
        request.body.sourceEnvironment,
        request.body.targetEnvironment,
        request.body.gateName,
        request.body.gateType,
        request.body.criteria,
        request.body.requiredApprovals,
        request.body.approvalRoles
      );
      return reply.code(201).send(gate);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get("/api/v1/promotion-gates", async (request, reply) => {
    try {
      const { sourceEnvironment, targetEnvironment } = request.query as Record<string, string>;
      const gates = await promotionGatesService.getGates(sourceEnvironment, targetEnvironment);
      return reply.send(gates);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.post<{ Body: RequestPromotionBody }>("/api/v1/promotions", async (request, reply) => {
    try {
      const promotion = await promotionGatesService.requestPromotion(
        request.body.deploymentId,
        request.body.version,
        request.body.sourceEnvironment,
        request.body.targetEnvironment
      );
      return reply.code(201).send(promotion);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get("/api/v1/promotions", async (request, reply) => {
    try {
      const { sourceEnvironment, targetEnvironment, status } = request.query as Record<string, string>;
      const promotions = await promotionGatesService.listPromotions(sourceEnvironment, targetEnvironment, status);
      return reply.send(promotions);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.get<{ Params: { promotionId: string } }>("/api/v1/promotions/:promotionId", async (request, reply) => {
    try {
      const promotion = await promotionGatesService.getPromotion(request.params.promotionId);
      if (!promotion) {
        return reply.code(404).send({ error: "Promotion not found" });
      }
      return reply.send(promotion);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });

  app.post<{ Params: { promotionId: string }; Body: ExecuteGateBody }>(
    "/api/v1/promotions/:promotionId/execute-gate",
    async (request, reply) => {
      try {
        const log = await promotionGatesService.executeGate(
          request.body.gateId,
          request.params.promotionId,
          request.body.passed,
          request.body.result,
          request.body.durationMs
        );
        return reply.code(201).send(log);
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  app.post<{ Params: { promotionId: string }; Body: ApprovePromotionBody }>(
    "/api/v1/promotions/:promotionId/approve",
    async (request, reply) => {
      try {
        const approval = await promotionGatesService.approvePromotion(
          request.params.promotionId,
          request.body.approverId,
          request.body.comment
        );
        return reply.code(201).send(approval);
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  app.post<{ Params: { promotionId: string }; Body: DenyPromotionBody }>(
    "/api/v1/promotions/:promotionId/deny",
    async (request, reply) => {
      try {
        const approval = await promotionGatesService.denyPromotion(
          request.params.promotionId,
          request.body.approverId,
          request.body.reason
        );
        return reply.code(201).send(approval);
      } catch (error) {
        return reply.code(400).send({ error: String(error) });
      }
    }
  );

  app.post<{ Params: { promotionId: string } }>("/api/v1/promotions/:promotionId/promote", async (request, reply) => {
    try {
      const promotion = await promotionGatesService.promoteDeployment(request.params.promotionId);
      return reply.send(promotion);
    } catch (error) {
      return reply.code(400).send({ error: String(error) });
    }
  });
}
