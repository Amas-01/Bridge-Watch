import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import {
  marketImpactPresetsService,
  PresetNotFoundError,
} from "../../services/marketImpactPresets.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Market Impact Scenario Presets API (#1159).
 *
 * Mounted at `/api/v1/liquidity/market-impact-presets`.
 *
 *   GET    /                 list presets (system presets seeded on first read)
 *   POST   /                 create a preset        (admin:config)
 *   PATCH  /:id              edit a custom preset   (admin:config)
 *   DELETE /:id              delete a custom preset (admin:config)
 *   POST   /:id/apply        run the preset against matching pools
 */

const presetBodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  tradeSizeUsd: z.number().positive().max(1e12),
  slippageTolerancePct: z.number().positive().max(100),
});

const presetPatchSchema = presetBodySchema.partial();

const applyBodySchema = z.object({
  poolId: z.string().trim().min(1).max(200).optional(),
  assetA: z.string().trim().min(1).max(120).optional(),
  assetB: z.string().trim().min(1).max(120).optional(),
});

export async function marketImpactPresetsRoutes(server: FastifyInstance) {
  const requireRead = authMiddleware();
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:config"] });

  server.get(
    "/",
    { preHandler: requireRead } as never,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      await marketImpactPresetsService.seedSystemPresets();
      const presets = await marketImpactPresetsService.listPresets();
      return reply.send({ presets, total: presets.length });
    }
  );

  server.post(
    "/",
    { preHandler: requireAdmin } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = presetBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid body", details: parsed.error.issues });
      }

      try {
        const preset = await marketImpactPresetsService.createPreset({
          ...parsed.data,
          createdBy: (request as { apiKeyAuth?: { id?: string } }).apiKeyAuth?.id ?? null,
        });
        return reply.status(201).send({ preset });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Create failed";
        logger.error({ error }, "Market impact preset creation failed");
        return reply.status(409).send({ error: message });
      }
    }
  );

  server.patch(
    "/:id",
    { preHandler: requireAdmin } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = presetPatchSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid body", details: parsed.error.issues });
      }

      try {
        const preset = await marketImpactPresetsService.updatePreset(id, parsed.data);
        return reply.send({ preset });
      } catch (error) {
        if (error instanceof PresetNotFoundError) {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(400)
          .send({ error: error instanceof Error ? error.message : "Update failed" });
      }
    }
  );

  server.delete(
    "/:id",
    { preHandler: requireAdmin } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      try {
        await marketImpactPresetsService.deletePreset(id);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof PresetNotFoundError) {
          return reply.status(404).send({ error: error.message });
        }
        return reply
          .status(400)
          .send({ error: error instanceof Error ? error.message : "Delete failed" });
      }
    }
  );

  server.post(
    "/:id/apply",
    { preHandler: requireRead } as never,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const parsed = applyBodySchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid body", details: parsed.error.issues });
      }

      try {
        const scenarios = await marketImpactPresetsService.applyPreset(id, parsed.data);
        return reply.send({
          scenarios,
          total: scenarios.length,
          breachCount: scenarios.filter((s) => !s.withinTolerance).length,
        });
      } catch (error) {
        if (error instanceof PresetNotFoundError) {
          return reply.status(404).send({ error: error.message });
        }
        const message = error instanceof Error ? error.message : "Scenario failed";
        logger.error({ error, presetId: id }, "Market impact scenario failed");
        return reply.status(500).send({ error: message });
      }
    }
  );
}
