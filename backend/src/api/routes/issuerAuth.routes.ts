import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { issuerAuthService } from "../../services/issuerAuth.service.js";
import { authMiddleware } from "../middleware/auth.js";

interface RecordAuthStateBody {
  issuerAddress: string;
  assetCode: string;
  authRequired: boolean;
  authRevocable: boolean;
  authClawbackEnabled: boolean;
  authImmutable: boolean;
}

interface QueryLatestQuery {
  issuerAddress: string;
  assetCode: string;
}

export async function issuerAuthRoutes(server: FastifyInstance) {
  // Record latest auth state and check for alerts (admin only)
  server.post<{ Body: RecordAuthStateBody }>(
    "/issuer-auth/states",
    {
      preHandler: [authMiddleware({ requiredScopes: ["admin"] })],
      schema: {
        tags: ["Issuer Auth Monitoring"],
        summary: "Record issuer authorization state",
        body: {
          type: "object",
          required: ["issuerAddress", "assetCode", "authRequired", "authRevocable", "authClawbackEnabled", "authImmutable"],
          properties: {
            issuerAddress: { type: "string" },
            assetCode: { type: "string" },
            authRequired: { type: "boolean" },
            authRevocable: { type: "boolean" },
            authClawbackEnabled: { type: "boolean" },
            authImmutable: { type: "boolean" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: RecordAuthStateBody }>, reply: FastifyReply) => {
      try {
        const { issuerAddress, assetCode, authRequired, authRevocable, authClawbackEnabled, authImmutable } = request.body;
        const result = await issuerAuthService.recordAuthState(
          issuerAddress,
          assetCode,
          authRequired,
          authRevocable,
          authClawbackEnabled,
          authImmutable
        );
        return reply.code(201).send(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to record auth state";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get the latest recorded auth state for an issuer asset (public)
  server.get<{ Querystring: QueryLatestQuery }>(
    "/issuer-auth/latest",
    {
      schema: {
        tags: ["Issuer Auth Monitoring"],
        summary: "Get latest auth state for an issuer",
        querystring: {
          type: "object",
          required: ["issuerAddress", "assetCode"],
          properties: {
            issuerAddress: { type: "string" },
            assetCode: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Querystring: QueryLatestQuery }>, reply: FastifyReply) => {
      try {
        const { issuerAddress, assetCode } = request.query;
        const state = await issuerAuthService.getLatestAuthState(issuerAddress, assetCode);
        if (!state) {
          return reply.code(404).send({ error: "Auth state not found for issuer/asset" });
        }
        return reply.send(state);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch auth state";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Get all active alerts (public)
  server.get(
    "/issuer-auth/alerts",
    {
      schema: {
        tags: ["Issuer Auth Monitoring"],
        summary: "Get all active issuer auth alerts"
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const alerts = await issuerAuthService.getActiveAlerts();
        return reply.send({ alerts });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch active alerts";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Resolve an alert (admin only)
  server.post<{ Params: { alertId: string } }>(
    "/issuer-auth/alerts/:alertId/resolve",
    {
      preHandler: [authMiddleware({ requiredScopes: ["admin"] })],
      schema: {
        tags: ["Issuer Auth Monitoring"],
        summary: "Resolve an active issuer auth alert",
        params: {
          type: "object",
          required: ["alertId"],
          properties: {
            alertId: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { alertId: string } }>, reply: FastifyReply) => {
      try {
        const { alertId } = request.params;
        const alert = await issuerAuthService.resolveAlert(alertId);
        if (!alert) {
          return reply.code(404).send({ error: "Alert not found" });
        }
        return reply.send(alert);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to resolve alert";
        return reply.code(400).send({ error: message });
      }
    }
  );
}
