import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { addressLabelService } from "../../services/addressLabel.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Transaction address labeling routes (#1152).
 *
 * Registered at prefix: /api/v1/address-labels
 */
export async function addressLabelsRoutes(server: FastifyInstance) {
  const requireWrite = authMiddleware({ requiredScopes: ["address-labels:write"] });
  const requireRead = authMiddleware({ requiredScopes: ["address-labels:read"] });

  // GET /  — search/list labels
  server.get<{
    Querystring: {
      category?: string;
      chain?: string;
      query?: string;
      includeInactive?: string;
      limit?: string;
      offset?: string;
    };
  }>("/", { preHandler: requireRead }, async (request, reply) => {
    try {
      const { category, chain, query, includeInactive, limit, offset } = request.query;
      const labels = await addressLabelService.searchLabels({
        category,
        chain,
        query,
        includeInactive: includeInactive === "true",
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      return reply.code(200).send({ labels });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Failed to search address labels");
      return reply.code(400).send({ error: message });
    }
  });

  // GET /lookup/:address  — single address lookup
  server.get<{ Params: { address: string }; Querystring: { chain?: string } }>(
    "/lookup/:address",
    { preHandler: requireRead },
    async (request, reply) => {
      const label = await addressLabelService.lookupAddress(
        request.params.address,
        request.query.chain ?? "stellar"
      );
      if (!label) {
        return reply.code(404).send({ error: "No label found for this address" });
      }
      return reply.code(200).send({ label });
    }
  );

  // POST /bulk-lookup  — enrich a batch of addresses (e.g. a transactions page)
  server.post<{ Body: { addresses?: string[]; chain?: string } }>(
    "/bulk-lookup",
    { preHandler: requireRead },
    async (request, reply) => {
      const { addresses, chain } = request.body ?? {};
      if (!Array.isArray(addresses) || addresses.length === 0) {
        return reply.code(400).send({ error: "addresses must be a non-empty array" });
      }
      if (addresses.length > 500) {
        return reply.code(400).send({ error: "addresses cannot exceed 500 entries per request" });
      }

      const labelsByAddress = await addressLabelService.lookupAddresses(addresses, chain);
      return reply.code(200).send({ labels: Object.fromEntries(labelsByAddress) });
    }
  );

  // POST /  — create a label
  server.post<{
    Body: {
      address?: string;
      chain?: string;
      label?: string;
      category?: string;
      notes?: string | null;
      confidence?: number;
      source?: string;
    };
  }>("/", { preHandler: requireWrite }, async (request, reply) => {
    const actorId = request.tenantContext?.actorId ?? "unknown";
    try {
      const body = request.body ?? {};
      if (!body.address || !body.label) {
        return reply.code(400).send({ error: "address and label are required" });
      }
      const created = await addressLabelService.createLabel({
        address: body.address,
        chain: body.chain,
        label: body.label,
        category: body.category,
        notes: body.notes,
        confidence: body.confidence,
        source: body.source,
        performedBy: actorId,
      });
      return reply.code(201).send({ label: created });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: message });
    }
  });

  // PATCH /:id  — update a label
  server.patch<{
    Params: { id: string };
    Body: {
      label?: string;
      category?: string;
      notes?: string | null;
      confidence?: number;
      isActive?: boolean;
    };
  }>("/:id", { preHandler: requireWrite }, async (request, reply) => {
    const actorId = request.tenantContext?.actorId ?? "unknown";
    try {
      const updated = await addressLabelService.updateLabel(request.params.id, request.body ?? {}, actorId);
      return reply.code(200).send({ label: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("not found") ? 404 : 400;
      return reply.code(status).send({ error: message });
    }
  });

  // DELETE /:id  — remove a label
  server.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireWrite },
    async (request, reply) => {
      const actorId = request.tenantContext?.actorId ?? "unknown";
      try {
        await addressLabelService.deleteLabel(request.params.id, actorId);
        return reply.code(204).send();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = message.includes("not found") ? 404 : 400;
        return reply.code(status).send({ error: message });
      }
    }
  );
}
