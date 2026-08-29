import type { FastifyInstance } from "fastify";
import { signedRequestVerificationService } from "../../services/signedRequestVerification.service.js";

export async function signedRequestVerificationRoutes(server: FastifyInstance) {
  server.get("/keys", async (request, reply) => {
    const { activeOnly } = request.query as { activeOnly?: string };
    const keys = await signedRequestVerificationService.listKeys(activeOnly === "true");
    return reply.send({ data: keys });
  });

  server.post("/keys", async (request, reply) => {
    const body = request.body as {
      keyId?: string;
      secret?: string;
      algorithm?: string;
      owner: string;
      maxClockSkewSeconds?: number;
    };

    try {
      const created = await signedRequestVerificationService.createKey(body);
      return reply.status(201).send({ data: created });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  server.post("/keys/:id/rotate", async (request, reply) => {
    const { id } = request.params as { id: string };
    const rotated = await signedRequestVerificationService.rotateKeySecret(id);
    if (!rotated) {
      return reply.status(404).send({ error: "Not Found", message: "Signing key not found" });
    }
    return reply.send({ data: rotated });
  });

  server.post("/keys/:id/revoke", async (request, reply) => {
    const { id } = request.params as { id: string };
    const revoked = await signedRequestVerificationService.revokeKey(id);
    if (!revoked) {
      return reply.status(404).send({ error: "Not Found", message: "Signing key not found" });
    }
    return reply.send({ data: revoked });
  });

  server.get("/logs", async (request, reply) => {
    const { keyId, status, limit } = request.query as {
      keyId?: string;
      status?: string;
      limit?: string;
    };

    const logs = await signedRequestVerificationService.listLogs({
      keyId,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return reply.send({ data: logs });
  });

  server.post("/test-verify", async (request, reply) => {
    const body = request.body as {
      keyId: string;
      method: string;
      path: string;
      timestamp: string | number;
      signature: string;
      payload?: any;
    };

    try {
      const result = await signedRequestVerificationService.verifySignature({
        keyId: body.keyId,
        method: body.method,
        path: body.path,
        timestamp: body.timestamp,
        signature: body.signature,
        body: body.payload,
        clientIp: request.ip,
      });
      return reply.send({ data: result });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });
}
