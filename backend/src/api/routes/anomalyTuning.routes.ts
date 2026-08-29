import type { FastifyInstance } from "fastify";
import type { AnomalyType } from "../../database/models/anomaly.model.js";
import { anomalyDetectionService } from "../../services/anomalyDetection.service.js";
import { authMiddleware } from "../middleware/auth.js";

const anomalyTypes = ["*", "spike", "drop", "divergence", "bridge_health", "multi_signal"] as const;

export async function anomalyTuningRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:config"] });

  server.get(
    "/tuning",
    {
      preHandler: requireAdmin,
      schema: {
        tags: ["Anomaly Detection"],
        summary: "Get the active anomaly baseline tuning profile",
        security: [{ ApiKeyAuth: [] }],
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async () => {
      const [profile, overrides] = await Promise.all([
        anomalyDetectionService.getTuningProfile(),
        anomalyDetectionService.getTuningOverrides(),
      ]);
      return { profile, overrides };
    }
  );

  server.put<{
    Body: { deviationMultiplier: number; slidingWindowSize: number };
  }>(
    "/tuning",
    {
      preHandler: requireAdmin,
      schema: {
        tags: ["Anomaly Detection"],
        summary: "Update the active anomaly baseline tuning profile",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          additionalProperties: false,
          required: ["deviationMultiplier", "slidingWindowSize"],
          properties: {
            deviationMultiplier: { type: "number", exclusiveMinimum: 0, maximum: 20 },
            slidingWindowSize: { type: "integer", minimum: 3, maximum: 1000 },
          },
        },
        response: { 200: { type: "object", additionalProperties: true } },
      },
    },
    async (request) => {
      const profile = await anomalyDetectionService.updateTuningProfile({
        ...request.body,
        updatedBy: request.apiKeyAuth?.name ?? null,
      });
      return { profile };
    }
  );

  server.post<{
    Body: {
      anomalyType?: AnomalyType | "*";
      assetCode?: string;
      bridgeName?: string;
      reason: string;
      startsAt?: string;
      expiresAt: string;
    };
  }>(
    "/tuning/overrides",
    {
      preHandler: requireAdmin,
      schema: {
        tags: ["Anomaly Detection"],
        summary: "Temporarily silence matching anomaly detections",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          additionalProperties: false,
          required: ["reason", "expiresAt"],
          properties: {
            anomalyType: { type: "string", enum: [...anomalyTypes], default: "*" },
            assetCode: { type: "string", minLength: 1, default: "*" },
            bridgeName: { type: "string", minLength: 1, default: "*" },
            reason: { type: "string", minLength: 3, maxLength: 500 },
            startsAt: { type: "string", format: "date-time" },
            expiresAt: { type: "string", format: "date-time" },
          },
        },
        response: { 201: { type: "object", additionalProperties: true } },
      },
    },
    async (request, reply) => {
      const startsAt = request.body.startsAt ? new Date(request.body.startsAt) : new Date();
      const expiresAt = new Date(request.body.expiresAt);
      if (expiresAt <= startsAt) {
        return reply.code(400).send({ error: "expiresAt must be later than startsAt" });
      }

      const override = await anomalyDetectionService.createTuningOverride({
        ...request.body,
        startsAt,
        expiresAt,
        createdBy: request.apiKeyAuth?.name ?? null,
      });
      return reply.code(201).send({ override });
    }
  );

  server.delete<{ Params: { id: string } }>(
    "/tuning/overrides/:id",
    {
      preHandler: requireAdmin,
      schema: {
        tags: ["Anomaly Detection"],
        summary: "Remove an anomaly tuning override",
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string", format: "uuid" } },
        },
      },
    },
    async (request, reply) => {
      const deleted = await anomalyDetectionService.deleteTuningOverride(request.params.id);
      if (!deleted) return reply.code(404).send({ error: "Tuning override not found" });
      return reply.code(204).send();
    }
  );
}
