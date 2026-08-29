import type { FastifyInstance, FastifyReply } from "fastify";
import { API_CONTRACTS, getContractFingerprint, getCurrentContract } from "./contracts.js";

export async function compatibilityRoutes(server: FastifyInstance): Promise<void> {
  server.get("/contract", {
    schema: {
      tags: ["Compatibility"],
      summary: "Inspect a negotiated API response contract",
      querystring: {
        type: "object",
        properties: { version: { type: "string", pattern: "^v[0-9]+$" } },
      },
      response: { 200: { type: "object", additionalProperties: true } },
    },
  }, async (request, reply) => {
    const version = (request.query as { version?: string }).version ?? request.apiContract.version;
    const contract = API_CONTRACTS.find((item) => item.version === version);
    if (!contract) return unsupportedVersion(reply);
    return { ...contract, fingerprint: getContractFingerprint(contract) };
  });

  server.get("/capabilities", {
    schema: {
      tags: ["Compatibility"],
      summary: "List fields and features supported by an API version",
      querystring: {
        type: "object",
        properties: { version: { type: "string", pattern: "^v[0-9]+$" } },
      },
      response: { 200: { type: "object", additionalProperties: true } },
    },
  }, async (request, reply) => {
    const version = (request.query as { version?: string }).version ?? request.apiContract.version;
    const contract = API_CONTRACTS.find((item) => item.version === version);
    if (!contract) return unsupportedVersion(reply);
    return {
      version: contract.version,
      fingerprint: getContractFingerprint(contract),
      capabilities: contract.capabilities,
    };
  });

  server.get("/versions", {
    schema: {
      tags: ["Compatibility"],
      summary: "List supported API versions",
      response: { 200: { type: "object", additionalProperties: true } },
    },
  }, async () => ({
    current: getCurrentContract().version,
    versions: API_CONTRACTS.map((contract) => ({
      version: contract.version,
      mediaType: contract.mediaType,
      status: contract.status,
      fingerprint: getContractFingerprint(contract),
      sunsetAt: contract.sunsetAt ?? null,
    })),
  }));
}

function unsupportedVersion(reply: FastifyReply) {
  return reply.code(406).send({
    error: "UNSUPPORTED_API_VERSION",
    message: "The requested API version is not supported.",
    supportedVersions: API_CONTRACTS.map((item) => item.version),
  });
}
