import type { FastifyInstance } from "fastify";
import { getCausalGraphService, type AddEdgeInput, type AddNodeInput } from "../../services/causalGraph.service.js";
import { authMiddleware } from "../middleware/auth.js";

export async function causalGraphRoutes(server: FastifyInstance) {
  const svc = getCausalGraphService();

  // GET /api/v1/incidents/:id/causal-graph — reproducible subgraph for the incident
  server.get<{
    Params: { id: string };
    Querystring: { includeReverted?: string; nodeTypes?: string; since?: string; limit?: string };
  }>(
    "/:id/causal-graph",
    {
      schema: {
        tags: ["Incidents"],
        summary: "Get the causal incident graph subgraph",
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      },
    },
    async (request, reply) => {
      const { includeReverted, nodeTypes, since, limit } = request.query;
      try {
        const result = await svc.getSubgraph(request.params.id, {
          includeReverted: includeReverted === "true",
          nodeTypes: nodeTypes ? (nodeTypes.split(",") as any) : undefined,
          since,
          limit: limit ? Number(limit) : undefined,
        });
        return result;
      } catch (e: any) {
        request.log.error({ err: e }, "Failed to fetch causal graph");
        return reply.status(500).send({ error: "Failed to fetch causal graph" });
      }
    }
  );

  // GET /api/v1/incidents/:id/causal-graph/export — reproducible export with checksum
  server.get<{ Params: { id: string }; Querystring: { includeReverted?: string } }>(
    "/:id/causal-graph/export",
    {
      schema: {
        tags: ["Incidents"],
        summary: "Export a reproducible causal graph snapshot for an incident",
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      },
    },
    async (request, reply) => {
      try {
        const result = await svc.exportIncidentGraph(request.params.id, {
          includeReverted: request.query.includeReverted === "true",
        });
        return result;
      } catch (e: any) {
        request.log.error({ err: e }, "Failed to export causal graph");
        return reply.status(500).send({ error: "Failed to export causal graph" });
      }
    }
  );

  // GET /api/v1/incidents/:id/causal-graph/revisions — audit trail of incremental updates
  server.get<{ Params: { id: string }; Querystring: { limit?: string } }>(
    "/:id/causal-graph/revisions",
    {
      schema: {
        tags: ["Incidents"],
        summary: "Get the revision audit trail for an incident's causal graph",
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
      },
    },
    async (request, reply) => {
      try {
        const revisions = await svc.getRevisions(request.params.id, request.query.limit ? Number(request.query.limit) : undefined);
        return { revisions };
      } catch (e: any) {
        request.log.error({ err: e }, "Failed to fetch causal graph revisions");
        return reply.status(500).send({ error: "Failed to fetch causal graph revisions" });
      }
    }
  );

  // POST /api/v1/incidents/:id/causal-graph/nodes — add or correct a node
  server.post<{ Params: { id: string }; Body: AddNodeInput }>(
    "/:id/causal-graph/nodes",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin", "operator"] }),
      schema: {
        tags: ["Incidents"],
        summary: "Add (or correct, if the same entity was already recorded) a causal graph node",
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        body: {
          type: "object",
          required: ["nodeType", "label", "occurredAt"],
          properties: {
            nodeType: { type: "string" },
            label: { type: "string" },
            occurredAt: { type: "string" },
            entityType: { type: "string" },
            entityId: { type: "string" },
            metadata: { type: "object", additionalProperties: true },
            actor: { type: "string" },
            autoLink: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const node = await svc.addNode(request.params.id, request.body);
        return reply.status(201).send(node);
      } catch (e: any) {
        request.log.error({ err: e }, "Failed to add causal graph node");
        return reply.status(500).send({ error: "Failed to add causal graph node" });
      }
    }
  );

  // POST /api/v1/incidents/:id/causal-graph/nodes/:nodeId/revert — reorg / retraction correction
  server.post<{ Params: { id: string; nodeId: string }; Body: { reason: string; actor?: string } }>(
    "/:id/causal-graph/nodes/:nodeId/revert",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin", "operator"] }),
      schema: {
        tags: ["Incidents"],
        summary: "Revert a causal graph node (e.g. a reorg dropped the underlying event)",
        params: { type: "object", properties: { id: { type: "string" }, nodeId: { type: "string" } }, required: ["id", "nodeId"] },
        body: { type: "object", required: ["reason"], properties: { reason: { type: "string" }, actor: { type: "string" } } },
      },
    },
    async (request, reply) => {
      try {
        const node = await svc.revertNode(request.params.id, request.params.nodeId, request.body.reason, request.body.actor);
        return node;
      } catch (e: any) {
        request.log.error({ err: e }, "Failed to revert causal graph node");
        return reply.status(500).send({ error: "Failed to revert causal graph node" });
      }
    }
  );

  // POST /api/v1/incidents/:id/causal-graph/edges — manually add a causal edge
  server.post<{ Params: { id: string }; Body: AddEdgeInput }>(
    "/:id/causal-graph/edges",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin", "operator"] }),
      schema: {
        tags: ["Incidents"],
        summary: "Add a causal edge, naming its evidence and inference rule",
        params: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        body: {
          type: "object",
          required: ["fromNodeId", "toNodeId", "confidenceClass", "inferenceRule", "evidence"],
          properties: {
            fromNodeId: { type: "string" },
            toNodeId: { type: "string" },
            relationType: { type: "string" },
            confidenceClass: { type: "string" },
            confidenceScore: { type: "number" },
            inferenceRule: { type: "string" },
            evidence: { type: "array", items: { type: "object", additionalProperties: true } },
            temporalConfidence: { type: "object", additionalProperties: true },
            actor: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const edge = await svc.addEdge(request.params.id, request.body);
        return reply.status(201).send(edge);
      } catch (e: any) {
        request.log.error({ err: e }, "Failed to add causal graph edge");
        return reply.status(400).send({ error: e.message ?? "Failed to add causal graph edge" });
      }
    }
  );

  // POST /api/v1/incidents/:id/causal-graph/edges/:edgeId/revert
  server.post<{ Params: { id: string; edgeId: string }; Body: { reason: string; actor?: string } }>(
    "/:id/causal-graph/edges/:edgeId/revert",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin", "operator"] }),
      schema: {
        tags: ["Incidents"],
        summary: "Revert a causal edge without deleting it",
        params: { type: "object", properties: { id: { type: "string" }, edgeId: { type: "string" } }, required: ["id", "edgeId"] },
        body: { type: "object", required: ["reason"], properties: { reason: { type: "string" }, actor: { type: "string" } } },
      },
    },
    async (request, reply) => {
      try {
        const edge = await svc.revertEdge(request.params.id, request.params.edgeId, request.body.reason, request.body.actor);
        return edge;
      } catch (e: any) {
        request.log.error({ err: e }, "Failed to revert causal graph edge");
        return reply.status(500).send({ error: "Failed to revert causal graph edge" });
      }
    }
  );

  // POST /api/v1/incidents/:id/causal-graph/edges/:edgeId/supersede — correction with new evidence
  server.post<{
    Params: { id: string; edgeId: string };
    Body: { reason: string; actor?: string; replacement: AddEdgeInput };
  }>(
    "/:id/causal-graph/edges/:edgeId/supersede",
    {
      preHandler: authMiddleware({ requiredScopes: ["admin", "operator"] }),
      schema: {
        tags: ["Incidents"],
        summary: "Supersede a causal edge's conclusion with a corrected one, keeping the original for audit",
        params: { type: "object", properties: { id: { type: "string" }, edgeId: { type: "string" } }, required: ["id", "edgeId"] },
        body: {
          type: "object",
          required: ["reason", "replacement"],
          properties: {
            reason: { type: "string" },
            actor: { type: "string" },
            replacement: { type: "object", additionalProperties: true },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const result = await svc.supersedeEdge(
          request.params.id,
          request.params.edgeId,
          request.body.replacement,
          request.body.reason,
          request.body.actor
        );
        return result;
      } catch (e: any) {
        request.log.error({ err: e }, "Failed to supersede causal graph edge");
        return reply.status(500).send({ error: "Failed to supersede causal graph edge" });
      }
    }
  );
}
