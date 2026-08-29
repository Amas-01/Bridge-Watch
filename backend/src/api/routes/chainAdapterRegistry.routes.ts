import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth.js";
import { chainAdapterRegistryService } from "../../services/chainAdapterRegistry.service.js";
import { logger } from "../../utils/logger.js";
import { sendApiError } from "../utils/response.js";

const abiSchema = z.array(z.union([z.string(), z.record(z.unknown())])).min(1);

const rawLogSchema = z.object({
  topics: z.array(z.string()),
  data: z.string(),
  blockNumber: z.number().int().nonnegative().optional(),
  logIndex: z.number().int().nonnegative().optional(),
  transactionHash: z.string().optional(),
});

const stageBodySchema = z.object({
  chainId: z.string().min(1).max(64),
  contractIdentity: z.string().min(1).max(128),
  contractAlias: z.string().max(128).optional(),
  abi: abiSchema,
  bytecodeHash: z.string().max(66).optional(),
  decimals: z.number().int().min(0).max(255).optional(),
  deploymentFromBlock: z.number().int().nonnegative(),
  deploymentToBlock: z.number().int().nonnegative().nullable().optional(),
  proxyImplementation: z.string().max(128).optional(),
  eventSchemas: z.record(z.unknown()).optional(),
  migrationHandler: z.string().max(128).optional(),
  signature: z.string().optional(),
  signerKeyId: z.string().max(128).optional(),
  allowUnsigned: z.boolean().optional(),
});

const proxyUpgradeBodySchema = z.object({
  chainId: z.string().min(1).max(64),
  contractIdentity: z.string().min(1).max(128),
  newImplementation: z.string().min(1).max(128),
  atBlock: z.number().int().nonnegative(),
  txHash: z.string().optional(),
  abi: abiSchema.optional(),
  bytecodeHash: z.string().max(66).optional(),
  decimals: z.number().int().min(0).max(255).optional(),
  signature: z.string().optional(),
  signerKeyId: z.string().max(128).optional(),
  allowUnsigned: z.boolean().optional(),
});

const signerBodySchema = z.object({
  keyId: z.string().min(1).max(128),
  algorithm: z.enum(["ed25519", "secp256k1", "p256"]),
  publicKeyPem: z.string().min(1),
  description: z.string().max(500).optional(),
});

const decodeBodySchema = z.object({
  registryVersion: z.string().min(1).max(200),
  rawLog: rawLogSchema,
});

const validateBodySchema = z.object({
  chainId: z.string().min(1).max(64),
  contractIdentity: z.string().min(1).max(128),
  blockNumber: z.number().int().nonnegative(),
  observedAbiHash: z.string().optional(),
  observedBytecodeHash: z.string().optional(),
  rawLog: rawLogSchema,
});

function handleError(reply: FastifyReply, error: unknown, message: string) {
  if (error instanceof z.ZodError) {
    return sendApiError(reply, 400, "Invalid payload", { issues: error.errors });
  }
  logger.error(error, message);
  return sendApiError(reply, 500, message);
}

export async function chainAdapterRegistryRoutes(server: FastifyInstance) {
  server.get(
    "/:chainId/:contractIdentity/epochs",
    async (
      request: FastifyRequest<{ Params: { chainId: string; contractIdentity: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { chainId, contractIdentity } = request.params;
        const epochs = await chainAdapterRegistryService.listEpochs(chainId, contractIdentity);
        return { chainId, contractIdentity, epochs };
      } catch (error) {
        return handleError(reply, error, "Failed to list chain-adapter epochs");
      }
    }
  );

  server.get(
    "/quarantine",
    async (
      request: FastifyRequest<{ Querystring: { chainId?: string; resolved?: string; limit?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { chainId, resolved, limit } = request.query;
        const rows = await chainAdapterRegistryService.listQuarantine({
          chainId,
          resolved: resolved == null ? undefined : resolved === "true",
          limit: limit ? Number(limit) : undefined,
        });
        return { quarantine: rows };
      } catch (error) {
        return handleError(reply, error, "Failed to list chain-adapter quarantine");
      }
    }
  );

  server.post(
    "/decode",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      try {
        const body = decodeBodySchema.parse(request.body);
        const decoded = await chainAdapterRegistryService.decodeHistoricalLog(
          body.registryVersion,
          body.rawLog
        );
        return decoded;
      } catch (error) {
        return handleError(reply, error, "Failed to decode historical log");
      }
    }
  );

  server.post(
    "/validate",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      try {
        const body = validateBodySchema.parse(request.body);
        const result = await chainAdapterRegistryService.validateAndRouteIngestion(body);
        if (result.quarantined) reply.code(409);
        return result;
      } catch (error) {
        return handleError(reply, error, "Failed to validate ingestion against registry");
      }
    }
  );

  server.post(
    "/signers",
    { preHandler: authMiddleware({ requiredScopes: ["config:write"] }) },
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      try {
        const body = signerBodySchema.parse(request.body);
        await chainAdapterRegistryService.registerSigner(
          body.keyId,
          body.algorithm,
          body.publicKeyPem,
          body.description
        );
        reply.code(201);
        return { success: true };
      } catch (error) {
        return handleError(reply, error, "Failed to register chain-adapter signer");
      }
    }
  );

  server.post(
    "/adapters",
    { preHandler: authMiddleware({ requiredScopes: ["config:write"] }) },
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      try {
        const body = stageBodySchema.parse(request.body);
        const adapter = await chainAdapterRegistryService.stageAdapter({
          ...body,
          createdBy: (request as any).apiKey?.name ?? "api",
        });
        reply.code(201);
        return { success: true, adapter };
      } catch (error) {
        return handleError(reply, error, "Failed to stage chain adapter");
      }
    }
  );

  server.post(
    "/adapters/:id/activate",
    { preHandler: authMiddleware({ requiredScopes: ["config:write"] }) },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const adapter = await chainAdapterRegistryService.activateAdapter(
          request.params.id,
          (request as any).apiKey?.name ?? "api"
        );
        return { success: true, adapter };
      } catch (error) {
        return handleError(reply, error, "Failed to activate chain adapter");
      }
    }
  );

  server.post(
    "/adapters/:id/rollback",
    { preHandler: authMiddleware({ requiredScopes: ["config:write"] }) },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const restored = await chainAdapterRegistryService.rollbackAdapter(
          request.params.id,
          request.body?.reason
        );
        return { success: true, restoredEpoch: restored };
      } catch (error) {
        return handleError(reply, error, "Failed to roll back chain adapter");
      }
    }
  );

  server.post(
    "/proxy-upgrades",
    { preHandler: authMiddleware({ requiredScopes: ["config:write"] }) },
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      try {
        const body = proxyUpgradeBodySchema.parse(request.body);
        const adapter = await chainAdapterRegistryService.recordProxyUpgrade(
          body.chainId,
          body.contractIdentity,
          {
            newImplementation: body.newImplementation,
            atBlock: body.atBlock,
            txHash: body.txHash,
            abi: body.abi,
            bytecodeHash: body.bytecodeHash,
            decimals: body.decimals,
            signature: body.signature,
            signerKeyId: body.signerKeyId,
            allowUnsigned: body.allowUnsigned,
            createdBy: (request as any).apiKey?.name ?? "api",
          }
        );
        reply.code(201);
        return { success: true, adapter };
      } catch (error) {
        return handleError(reply, error, "Failed to record proxy upgrade");
      }
    }
  );
}
