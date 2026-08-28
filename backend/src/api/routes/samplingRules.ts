import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { RequestSamplingService } from "../../services/requestSampling.service.js";
import type { SamplingTarget } from "../../services/requestSampling.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Admin routes for request sampling rule management.
 * Issue: #1058
 *
 * All endpoints require admin:sampling scope.
 *
 * Registered at prefix: /api/v1/admin/sampling-rules
 */
export async function samplingRulesRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:sampling"] });
  const service = RequestSamplingService.getInstance();

  // ---------------------------------------------------------------------------
  // GET /  — list all rules ordered by priority
  // ---------------------------------------------------------------------------
  server.get(
    "/",
    { preHandler: requireAdmin },
    async (_request, reply) => {
      try {
        const rules = await service.getSamplingRules();
        return reply.code(200).send({ rules });
      } catch (err) {
        logger.error({ err }, "Failed to list sampling rules");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to retrieve sampling rules.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /  — create a new rule
  // ---------------------------------------------------------------------------
  server.post<{
    Body: {
      name?: unknown;
      description?: unknown;
      sampleRate?: unknown;
      target?: unknown;
      targetValue?: unknown;
      enabled?: unknown;
      priority?: unknown;
    };
  }>(
    "/",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { name, description, sampleRate, target, targetValue, enabled, priority } =
        request.body ?? {};

      if (!name || typeof name !== "string" || !name.trim()) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "name is required.",
        });
      }

      const rate = Number(sampleRate);
      if (sampleRate === undefined || sampleRate === null || isNaN(rate)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "sampleRate is required and must be a number.",
        });
      }

      if (rate < 0 || rate > 1) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "sampleRate must be between 0.0 and 1.0 inclusive.",
        });
      }

      const validTargets: SamplingTarget[] = [
        "all_requests",
        "endpoint_pattern",
        "client_id",
      ];
      const resolvedTarget = (target as SamplingTarget) ?? "all_requests";
      if (!validTargets.includes(resolvedTarget)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `target must be one of: ${validTargets.join(", ")}.`,
        });
      }

      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        const rule = await service.createRule({
          name: name.trim(),
          description: typeof description === "string" ? description : undefined,
          sampleRate: rate,
          target: resolvedTarget,
          targetValue:
            typeof targetValue === "string" ? targetValue : undefined,
          enabled: enabled === undefined ? true : Boolean(enabled),
          priority: priority !== undefined ? Number(priority) : 0,
          createdBy: actor,
        });

        return reply.code(201).send({ rule });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create rule.";
        const isValidation =
          message.includes("sample_rate") || message.includes("unique");
        return reply.code(isValidation ? 400 : 500).send({
          error: isValidation ? "Bad Request" : "Internal Server Error",
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // PATCH /:id  — update a rule
  // ---------------------------------------------------------------------------
  server.patch<{
    Params: { id: string };
    Body: {
      name?: unknown;
      description?: unknown;
      sampleRate?: unknown;
      target?: unknown;
      targetValue?: unknown;
      enabled?: unknown;
      priority?: unknown;
    };
  }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      const { name, description, sampleRate, target, targetValue, enabled, priority } =
        request.body ?? {};

      const actor = request.apiKeyAuth?.name ?? "admin";

      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = String(name);
      if (description !== undefined) updates.description = String(description);
      if (sampleRate !== undefined) {
        const rate = Number(sampleRate);
        if (isNaN(rate) || rate < 0 || rate > 1) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "sampleRate must be between 0.0 and 1.0 inclusive.",
          });
        }
        updates.sampleRate = rate;
      }
      if (target !== undefined) updates.target = target as SamplingTarget;
      if (targetValue !== undefined) updates.targetValue = targetValue as string;
      if (enabled !== undefined) updates.enabled = Boolean(enabled);
      if (priority !== undefined) updates.priority = Number(priority);

      try {
        const rule = await service.updateRule(id, updates, actor);
        return reply.code(200).send({ rule });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update rule.";
        const isNotFound = message.includes("not found");
        return reply.code(isNotFound ? 404 : 400).send({
          error: isNotFound ? "Not Found" : "Bad Request",
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // DELETE /:id  — delete a rule
  // ---------------------------------------------------------------------------
  server.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        await service.deleteRule(id, actor);
        return reply.code(200).send({ message: "Sampling rule deleted." });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to delete rule.";
        return reply.code(message.includes("not found") ? 404 : 500).send({
          error: message.includes("not found") ? "Not Found" : "Internal Server Error",
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /evaluate  — test rules against a mock request descriptor
  // ---------------------------------------------------------------------------
  server.get<{
    Querystring: { id?: string; url?: string; clientId?: string };
  }>(
    "/evaluate",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id, url, clientId } = request.query;

      if (!id) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Query parameter 'id' (request ID) is required.",
        });
      }

      if (!url) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "Query parameter 'url' is required.",
        });
      }

      try {
        const result = await service.evaluateRequest({
          id,
          url,
          clientId,
        });
        return reply.code(200).send(result);
      } catch (err) {
        logger.error({ err }, "Failed to evaluate sampling rules");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to evaluate sampling rules.",
        });
      }
    }
  );
}
