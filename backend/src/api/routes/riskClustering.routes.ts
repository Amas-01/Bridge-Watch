import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { riskClusteringService } from "../../services/riskClustering.service.js";
import { authMiddleware } from "../middleware/auth.js";

interface CreateClusterBody {
  name: string;
  riskLevel: "low" | "moderate" | "high" | "critical";
  description?: string;
}

interface MapAccountBody {
  accountAddress: string;
  reason?: string;
  confidenceScore?: number;
  addedBy: string;
}

interface RecordSignalBody {
  accountAddress: string;
  signalType: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  description?: string;
}

interface QuerySignalsQuery {
  limit?: string;
  offset?: string;
}

export async function riskClusteringRoutes(server: FastifyInstance) {
  // Create a new risk cluster (admin scope required)
  server.post<{ Body: CreateClusterBody }>(
    "/risk/clusters",
    {
      preHandler: [authMiddleware({ requiredScopes: ["admin"] })],
      schema: {
        tags: ["Risk Clustering"],
        summary: "Create a new account risk cluster",
        body: {
          type: "object",
          required: ["name", "riskLevel"],
          properties: {
            name: { type: "string" },
            riskLevel: { type: "string", enum: ["low", "moderate", "high", "critical"] },
            description: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: CreateClusterBody }>, reply: FastifyReply) => {
      try {
        const { name, riskLevel, description } = request.body;
        if (!name || !riskLevel) {
          return reply.code(400).send({ error: "name and riskLevel are required" });
        }
        const cluster = await riskClusteringService.createCluster(name, riskLevel, description);
        return reply.code(201).send(cluster);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create cluster";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // List all risk clusters (public)
  server.get(
    "/risk/clusters",
    {
      schema: {
        tags: ["Risk Clustering"],
        summary: "List all risk clusters"
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const clusters = await riskClusteringService.getClusters();
        return reply.send({ clusters });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch clusters";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Map an account to a cluster (analyst/admin scope required)
  server.post<{ Params: { clusterId: string }; Body: MapAccountBody }>(
    "/risk/clusters/:clusterId/accounts",
    {
      preHandler: [authMiddleware({ requiredScopes: ["admin"] })],
      schema: {
        tags: ["Risk Clustering"],
        summary: "Map a Stellar account to a risk cluster",
        params: {
          type: "object",
          required: ["clusterId"],
          properties: {
            clusterId: { type: "string" }
          }
        },
        body: {
          type: "object",
          required: ["accountAddress", "addedBy"],
          properties: {
            accountAddress: { type: "string" },
            reason: { type: "string" },
            confidenceScore: { type: "number", minimum: 0, maximum: 1.0 },
            addedBy: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { clusterId: string }; Body: MapAccountBody }>, reply: FastifyReply) => {
      try {
        const { clusterId } = request.params;
        const { accountAddress, reason, confidenceScore, addedBy } = request.body;

        if (!accountAddress || !addedBy) {
          return reply.code(400).send({ error: "accountAddress and addedBy are required" });
        }

        const mapping = await riskClusteringService.mapAccountToCluster(
          clusterId,
          accountAddress,
          addedBy,
          reason,
          confidenceScore ?? 1.0
        );
        return reply.code(201).send(mapping);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to map account";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get the risk profile of an account (public)
  server.get<{ Params: { address: string } }>(
    "/risk/accounts/:address",
    {
      schema: {
        tags: ["Risk Clustering"],
        summary: "Get the risk profile and cluster of a Stellar account",
        params: {
          type: "object",
          required: ["address"],
          properties: {
            address: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { address: string } }>, reply: FastifyReply) => {
      try {
        const { address } = request.params;
        if (address.length !== 56 || !address.startsWith("G")) {
          return reply.code(400).send({ error: "Invalid Stellar address format" });
        }
        const profile = await riskClusteringService.getAccountRiskProfile(address);
        return reply.send(profile);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch risk profile";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Record a risk signal for an account (admin/internal service scope required)
  server.post<{ Body: RecordSignalBody }>(
    "/risk/signals",
    {
      preHandler: [authMiddleware({ requiredScopes: ["admin"] })],
      schema: {
        tags: ["Risk Clustering"],
        summary: "Record a new account risk signal",
        body: {
          type: "object",
          required: ["accountAddress", "signalType", "severity"],
          properties: {
            accountAddress: { type: "string" },
            signalType: { type: "string" },
            severity: { type: "string", enum: ["info", "low", "medium", "high", "critical"] },
            description: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: RecordSignalBody }>, reply: FastifyReply) => {
      try {
        const { accountAddress, signalType, severity, description } = request.body;
        if (!accountAddress || !signalType || !severity) {
          return reply.code(400).send({ error: "accountAddress, signalType, and severity are required" });
        }
        const signal = await riskClusteringService.recordRiskSignal(
          accountAddress,
          signalType,
          severity,
          description
        );
        return reply.code(201).send(signal);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to record risk signal";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // List recorded risk signals (public)
  server.get<{ Querystring: QuerySignalsQuery }>(
    "/risk/signals",
    {
      schema: {
        tags: ["Risk Clustering"],
        summary: "List risk signals",
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string" },
            offset: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Querystring: QuerySignalsQuery }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;
        const signals = await riskClusteringService.getRiskSignals(limit, offset);
        return reply.send({ signals, limit, offset });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to query risk signals";
        return reply.code(500).send({ error: message });
      }
    }
  );
}
