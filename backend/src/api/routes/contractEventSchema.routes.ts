import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { contractEventSchemaService } from "../../services/contractEventSchema.service.js";
import { authMiddleware } from "../middleware/auth.js";

interface RegisterSchemaBody {
  contractId: string;
  eventType: string;
  schemaJson: Record<string, unknown>;
}

interface RecordEventBody {
  txHash: string;
  ledgerSeq: number;
  eventData: Record<string, unknown>;
}

interface QueryEventsQuery {
  limit?: string;
  offset?: string;
}

export async function contractEventSchemaRoutes(server: FastifyInstance) {
  // Register a contract event schema (admin required)
  server.post<{ Body: RegisterSchemaBody }>(
    "/contracts/schemas",
    {
      preHandler: [authMiddleware({ requiredScopes: ["admin"] })],
      schema: {
        tags: ["Soroban Event Schema"],
        summary: "Register smart contract event schema",
        body: {
          type: "object",
          required: ["contractId", "eventType", "schemaJson"],
          properties: {
            contractId: { type: "string" },
            eventType: { type: "string" },
            schemaJson: { type: "object", additionalProperties: true }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Body: RegisterSchemaBody }>, reply: FastifyReply) => {
      try {
        const { contractId, eventType, schemaJson } = request.body;
        const schema = await contractEventSchemaService.registerSchema(contractId, eventType, schemaJson);
        return reply.code(201).send(schema);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to register schema";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // List all schemas for a specific contract (public)
  server.get<{ Params: { contractId: string } }>(
    "/contracts/:contractId/schemas",
    {
      schema: {
        tags: ["Soroban Event Schema"],
        summary: "Get registered schemas for a smart contract",
        params: {
          type: "object",
          required: ["contractId"],
          properties: {
            contractId: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { contractId: string } }>, reply: FastifyReply) => {
      try {
        const { contractId } = request.params;
        if (contractId.length !== 56 || !contractId.startsWith("C")) {
          return reply.code(400).send({ error: "Invalid Soroban contract ID format" });
        }
        const schemas = await contractEventSchemaService.getSchemasByContract(contractId);
        return reply.send({ schemas });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch schemas";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Record a matched event for a schema (internal/admin required)
  server.post<{ Params: { schemaId: string }; Body: RecordEventBody }>(
    "/contracts/schemas/:schemaId/events",
    {
      preHandler: [authMiddleware({ requiredScopes: ["admin"] })],
      schema: {
        tags: ["Soroban Event Schema"],
        summary: "Index a matched smart contract event",
        params: {
          type: "object",
          required: ["schemaId"],
          properties: {
            schemaId: { type: "string" }
          }
        },
        body: {
          type: "object",
          required: ["txHash", "ledgerSeq", "eventData"],
          properties: {
            txHash: { type: "string" },
            ledgerSeq: { type: "integer" },
            eventData: { type: "object", additionalProperties: true }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { schemaId: string }; Body: RecordEventBody }>, reply: FastifyReply) => {
      try {
        const { schemaId } = request.params;
        const { txHash, ledgerSeq, eventData } = request.body;
        const event = await contractEventSchemaService.recordMatchedEvent(schemaId, txHash, ledgerSeq, eventData);
        return reply.code(201).send(event);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to record event";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get matched events for a schema (public)
  server.get<{ Params: { schemaId: string }; Querystring: QueryEventsQuery }>(
    "/contracts/schemas/:schemaId/events",
    {
      schema: {
        tags: ["Soroban Event Schema"],
        summary: "Get indexed matched events for a schema",
        params: {
          type: "object",
          required: ["schemaId"],
          properties: {
            schemaId: { type: "string" }
          }
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "string" },
            offset: { type: "string" }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { schemaId: string }; Querystring: QueryEventsQuery }>, reply: FastifyReply) => {
      try {
        const { schemaId } = request.params;
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const offset = request.query.offset ? parseInt(request.query.offset, 10) : 0;
        const events = await contractEventSchemaService.getMatchedEvents(schemaId, limit, offset);
        return reply.send({ events, limit, offset });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch events";
        return reply.code(500).send({ error: message });
      }
    }
  );
}
