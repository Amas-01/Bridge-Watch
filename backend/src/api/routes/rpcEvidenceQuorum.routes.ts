import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { rpcEvidenceQuorumService } from "../../services/rpcEvidenceQuorum.service.js";
import { authMiddleware } from "../middleware/auth.js";
import { sendApiError } from "../utils/response.js";

const providerResponseSchema = z.object({
  endpoint: z.string(),
  providerGroup: z.string().optional(),
  blockNumber: z.number().int().nonnegative(),
  blockHash: z.string(),
  stateRoot: z.string().optional(),
  timestamp: z.number().optional(),
  data: z.unknown(),
  error: z.string().optional(),
});

const evaluateQuorumSchema = z.object({
  chainId: z.string(),
  operationType: z.string(),
  readIdentifier: z.string(),
  responses: z.array(providerResponseSchema).min(1),
  overrideFailClosed: z.boolean().optional(),
  minQuorumSize: z.number().int().min(1).optional(),
  maxLagBlocks: z.number().int().min(0).optional(),
});

const configSchema = z.object({
  chainId: z.string(),
  operationType: z.string(),
  minQuorumSize: z.number().int().min(1).optional(),
  quorumThresholdRatio: z.number().min(0.1).max(1.0).optional(),
  maxLagBlocks: z.number().int().min(0).optional(),
  failClosed: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const providerGroupSchema = z.object({
  endpointUrl: z.string(),
  providerGroup: z.string(),
  asnOrOrg: z.string().optional(),
});

export async function rpcEvidenceQuorumRoutes(server: FastifyInstance): Promise<void> {
  const adminAuth = authMiddleware({ requiredScopes: ["admin:write"] });

  // Verify RPC evidence quorum for chain state read
  server.post("/verify", async (request, reply) => {
    const parsed = evaluateQuorumSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "Invalid evidence verification payload", { issues: parsed.error.errors });
    }

    try {
      const result = await rpcEvidenceQuorumService.evaluateQuorum(parsed.data as any);
      return reply.status(200).send(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return sendApiError(reply, 422, message, { failClosed: true });
    }
  });

  // Get quorum config
  server.get("/configs", async (request, reply) => {
    const { chainId, operationType } = request.query as { chainId?: string; operationType?: string };
    if (!chainId || !operationType) {
      return sendApiError(reply, 400, "Missing required query parameters: chainId, operationType");
    }

    const config = await rpcEvidenceQuorumService.getConfig(chainId, operationType);
    return reply.status(200).send({ chainId, operationType, ...config });
  });

  // Set or update quorum config
  server.post("/configs", { preHandler: [adminAuth] }, async (request, reply) => {
    const parsed = configSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "Invalid quorum config payload", { issues: parsed.error.errors });
    }

    const config = await rpcEvidenceQuorumService.setConfig(parsed.data as any);
    return reply.status(200).send(config);
  });

  // Get evidence logs
  server.get("/logs", async (request, reply) => {
    const { chainId, limit } = request.query as { chainId?: string; limit?: string };
    const logs = await rpcEvidenceQuorumService.getEvidenceLogs(chainId, Number(limit) || 20);
    return reply.status(200).send({ logs, count: logs.length });
  });

  // Register provider group mapping
  server.post("/provider-groups", { preHandler: [adminAuth] }, async (request, reply) => {
    const parsed = providerGroupSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, 400, "Invalid provider group payload", { issues: parsed.error.errors });
    }

    const record = await rpcEvidenceQuorumService.registerProviderGroup(
      parsed.data.endpointUrl,
      parsed.data.providerGroup,
      parsed.data.asnOrOrg
    );
    return reply.status(200).send(record);
  });
}
