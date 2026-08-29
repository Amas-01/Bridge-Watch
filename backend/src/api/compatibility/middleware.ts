import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  getContract,
  getContractFingerprint,
  getCurrentContract,
  isVendorMediaType,
  parseRequestedVersion,
} from "./contracts.js";

declare module "fastify" {
  interface FastifyRequest {
    apiContract: ReturnType<typeof getCurrentContract>;
  }
}

function applyContractHeaders(reply: FastifyReply, request: FastifyRequest): void {
  const contract = request.apiContract;
  reply.header("X-API-Version", contract.version);
  reply.header("X-API-Contract", getContractFingerprint(contract));
  reply.header("Vary", "Accept, X-API-Version");
  if (isVendorMediaType(request.headers.accept, contract)) {
    reply.type(contract.mediaType);
  }
  if (contract.status === "deprecated") {
    reply.header("Deprecation", "true");
    if (contract.sunsetAt) reply.header("Sunset", contract.sunsetAt);
  }
}

export async function registerCompatibilityMiddleware(server: FastifyInstance): Promise<void> {
  server.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;

    const requestedVersion = parseRequestedVersion(request.headers);
    const contract = requestedVersion ? getContract(requestedVersion) : getCurrentContract();

    if (!contract) {
      reply.header("Vary", "Accept, X-API-Version");
      return reply.code(406).send({
        error: "UNSUPPORTED_API_VERSION",
        message: "The requested API version is not supported.",
        supportedVersions: [getCurrentContract().version],
      });
    }

    request.apiContract = contract;
    applyContractHeaders(reply, request);
  });
}
