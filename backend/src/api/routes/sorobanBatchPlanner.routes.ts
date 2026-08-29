import type { FastifyInstance } from "fastify";
import {
  runSorobanBatchPlannerCycle,
  getSorobanBatchPlannerStatus,
} from "../../jobs/sorobanBatchPlanner.job.js";
import type { BatchItemInput } from "../../services/sorobanBatchPlanner.service.js";
import { logger } from "../../utils/logger.js";

interface PlanRequestBody {
  items?: Array<Partial<BatchItemInput>>;
}

function isValidItem(item: Partial<BatchItemInput>): item is BatchItemInput {
  return (
    typeof item.id === "string" &&
    item.id.length > 0 &&
    typeof item.idempotencyKey === "string" &&
    item.idempotencyKey.length > 0 &&
    typeof item.contractId === "string" &&
    item.contractId.length > 0 &&
    typeof item.functionName === "string" &&
    item.functionName.length > 0
  );
}

export async function sorobanBatchPlannerRoutes(server: FastifyInstance) {
  server.post(
    "/plan",
    {
      schema: {
        tags: ["Soroban"],
        summary: "Plan, dry-run submit, and reconcile a batch of Soroban submissions under configured resource ceilings",
        response: {
          200: { type: "object", additionalProperties: true },
          400: { type: "object", additionalProperties: true },
        },
      },
    },
    async (request, reply) => {
      const body = (request.body ?? {}) as PlanRequestBody;
      const items = Array.isArray(body.items) ? body.items : [];

      const invalid = items.filter((item) => !isValidItem(item));
      if (invalid.length > 0) {
        return reply.status(400).send({
          error: "Each item requires id, idempotencyKey, contractId, and functionName",
          invalidCount: invalid.length,
        });
      }

      logger.info({ itemCount: items.length }, "Manual Soroban batch planner cycle triggered via API");
      const report = await runSorobanBatchPlannerCycle(items as BatchItemInput[]);
      return reply.send(report);
    }
  );

  server.get(
    "/status",
    {
      schema: {
        tags: ["Soroban"],
        summary: "Snapshot of the Soroban batch planner's durable item lifecycle ledger",
        response: {
          200: { type: "object", additionalProperties: true },
        },
      },
    },
    async (_request, reply) => {
      return reply.send(getSorobanBatchPlannerStatus());
    }
  );
}
