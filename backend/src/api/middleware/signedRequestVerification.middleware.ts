import type { FastifyReply, FastifyRequest } from "fastify";
import { signedRequestVerificationService } from "../../services/signedRequestVerification.service.js";

export async function verifySignedRequestHook(request: FastifyRequest, reply: FastifyReply) {
  const keyId = request.headers["x-key-id"] as string;
  const timestamp = request.headers["x-timestamp"] as string;
  const signature = request.headers["x-signature"] as string;

  if (!keyId || !timestamp || !signature) {
    return reply.status(401).send({
      error: "Unauthorized",
      message: "Missing signature headers (X-Key-Id, X-Timestamp, X-Signature required)",
      statusCode: 401,
    });
  }

  const result = await signedRequestVerificationService.verifySignature({
    keyId,
    timestamp,
    signature,
    method: request.method,
    path: request.url,
    body: request.body,
    clientIp: request.ip,
  });

  if (!result.valid) {
    return reply.status(401).send({
      error: "Unauthorized",
      message: result.message || "Invalid request signature",
      status: result.status,
      statusCode: 401,
    });
  }
}
