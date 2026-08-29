import { FastifyInstance } from "fastify";
import { getCircuitBreakerService, PauseScope } from "../../services/circuitBreaker.service.js";
import { logger } from "../../utils/logger.js";

export async function circuitBreakerRoutes(fastify: FastifyInstance) {
  const circuitBreaker = getCircuitBreakerService();
  if (!circuitBreaker) {
    logger.warn("Circuit breaker service not configured, routes disabled");
    return;
  }

  fastify.get(
    "/status",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Check circuit-breaker pause status",
        description: "Returns whether the specified scope (global, bridge, or asset) is currently paused.",
        querystring: {
          type: "object",
          required: ["scope"],
          properties: {
            scope: {
              type: "string",
              enum: ["global", "bridge", "asset"],
              description: "Pause scope",
            },
            identifier: {
              type: "string",
              description: "Required for bridge and asset scopes",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              paused: { type: "boolean" },
              scope: { type: "string" },
              identifier: { type: "string", nullable: true },
            },
          },
          400: { $ref: "Error#" },
          500: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const { scope, identifier } = request.query as { scope?: string; identifier?: string };
        let pauseScope: PauseScope;
        switch (scope) {
          case "global":
            pauseScope = PauseScope.Global;
            break;
          case "bridge":
            if (!identifier) {
              return reply.code(400).send({ error: "identifier required for bridge scope" });
            }
            pauseScope = PauseScope.Bridge;
            break;
          case "asset":
            if (!identifier) {
              return reply.code(400).send({ error: "identifier required for asset scope" });
            }
            pauseScope = PauseScope.Asset;
            break;
          default:
            return reply.code(400).send({ error: "invalid scope" });
        }
        const isPaused = await circuitBreaker.isPaused(pauseScope, identifier);
        return { paused: isPaused, scope, identifier };
      } catch (error) {
        logger.error({ err: error }, "Circuit breaker status check failed");
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );

  fastify.get(
    "/whitelist",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Check whitelist status",
        querystring: {
          type: "object",
          required: ["type"],
          properties: {
            type: { type: "string", enum: ["address", "asset"] },
            address: { type: "string" },
            asset: { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              whitelisted: { type: "boolean" },
              type: { type: "string" },
              address: { type: "string", nullable: true },
              asset: { type: "string", nullable: true },
            },
          },
          400: { $ref: "Error#" },
          500: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const { type, address, asset } = request.query as {
          type?: string;
          address?: string;
          asset?: string;
        };
        if (type === "address" && address) {
          const isWhitelisted = await circuitBreaker.isWhitelistedAddress(address);
          return { whitelisted: isWhitelisted, type: "address", address };
        }
        if (type === "asset" && asset) {
          const isWhitelisted = await circuitBreaker.isWhitelistedAsset(asset);
          return { whitelisted: isWhitelisted, type: "asset", asset };
        }
        return reply.code(400).send({ error: "invalid whitelist query" });
      } catch (error) {
        logger.error({ err: error }, "Whitelist check failed");
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );

  fastify.post(
    "/pause",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Pause a scope (requires guardian auth — not yet implemented)",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["scope", "reason"],
          properties: {
            scope: { type: "string", enum: ["global", "bridge", "asset"] },
            identifier: { type: "string" },
            reason: { type: "string" },
          },
        },
        response: {          500: { $ref: "Error#" },          501: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const { scope, identifier, reason } = request.body as {
          scope: string;
          identifier?: string;
          reason: string;
        };
        logger.info({ scope, identifier, reason }, "Pause operation requested");
        return reply.code(501).send({ error: "Not implemented - requires guardian authentication" });
      } catch (error) {
        logger.error({ err: error }, "Pause operation failed");
        return reply.code(500).send({ error: "Internal server error" });
      }
    },
  );

  fastify.post(
    "/recovery",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Recover from a pause (requires guardian auth — not yet implemented)",
        security: [{ ApiKeyAuth: [] }],
        body: {
          type: "object",
          required: ["pauseId"],
          properties: { pauseId: { type: "integer" } },
        },
        response: {
          500: { $ref: "Error#" },
          501: { $ref: "Error#" },
        },
      },
    },
    async (request, reply) => {
      try {
        const { pauseId } = request.body as { pauseId: number };
        logger.info({ pauseId }, "Recovery operation requested");
        return reply.code(501).send({ error: "Not implemented - requires guardian authentication" });
      } catch (error) {
        logger.error({ err: error }, "Recovery operation failed");
        return reply.code(500).send({ error: "Internal server error" });
      }
    }
  );

  // ─── Remediation Actions Management ─────────────────────────────────────

  fastify.get(
    "/actions",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "List circuit breaker remediation actions",
        description: "Returns all registered remediation action configurations.",
      },
    },
    async (_request, reply) => {
      try {
        const { circuitBreakerActionEngine } = await import("../../services/circuitBreakerActionEngine.service.js");
        const actions = await circuitBreakerActionEngine.getAllActionConfigs();
        return { actions };
      } catch (error) {
        logger.error({ err: error }, "Failed to fetch circuit breaker action configs");
        return reply.code(500).send({ error: "Internal server error" });
      }
    }
  );

  fastify.get(
    "/actions/:id",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Get circuit breaker remediation action by ID",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { circuitBreakerActionEngine } = await import("../../services/circuitBreakerActionEngine.service.js");
        const action = await circuitBreakerActionEngine.getActionConfigById(id);
        if (!action) {
          return reply.code(404).send({ error: "Action configuration not found" });
        }
        return { action };
      } catch (error) {
        logger.error({ err: error }, "Failed to fetch circuit breaker action config");
        return reply.code(500).send({ error: "Internal server error" });
      }
    }
  );

  fastify.post(
    "/actions",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Create circuit breaker remediation action",
        body: {
          type: "object",
          required: ["name", "alert_type", "action_type", "config"],
          properties: {
            name: { type: "string" },
            alert_type: { type: "string" },
            action_type: { type: "string", enum: ["script", "webhook", "contract_pause"] },
            config: { type: ["object", "string"] },
            enabled: { type: "boolean" },
            timeout_ms: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const body = request.body as any;
        const { circuitBreakerActionEngine } = await import("../../services/circuitBreakerActionEngine.service.js");
        const action = await circuitBreakerActionEngine.createActionConfig(body);
        return reply.code(210).send ? reply.code(201).send({ action }) : reply.code(201).send({ action });
      } catch (error) {
        logger.error({ err: error }, "Failed to create circuit breaker action config");
        return reply.code(500).send({ error: "Internal server error" });
      }
    }
  );

  fastify.put(
    "/actions/:id",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Update circuit breaker remediation action",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            alert_type: { type: "string" },
            action_type: { type: "string", enum: ["script", "webhook", "contract_pause"] },
            config: { type: ["object", "string"] },
            enabled: { type: "boolean" },
            timeout_ms: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as any;
        const { circuitBreakerActionEngine } = await import("../../services/circuitBreakerActionEngine.service.js");
        const updated = await circuitBreakerActionEngine.updateActionConfig(id, body);
        if (!updated) {
          return reply.code(404).send({ error: "Action configuration not found" });
        }
        return { action: updated };
      } catch (error) {
        logger.error({ err: error }, "Failed to update circuit breaker action config");
        return reply.code(500).send({ error: "Internal server error" });
      }
    }
  );

  fastify.delete(
    "/actions/:id",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Delete circuit breaker remediation action",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { circuitBreakerActionEngine } = await import("../../services/circuitBreakerActionEngine.service.js");
        const success = await circuitBreakerActionEngine.deleteActionConfig(id);
        if (!success) {
          return reply.code(404).send({ error: "Action configuration not found" });
        }
        return { success: true };
      } catch (error) {
        logger.error({ err: error }, "Failed to delete circuit breaker action config");
        return reply.code(500).send({ error: "Internal server error" });
      }
    }
  );

  fastify.post(
    "/actions/:id/test",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Test run circuit breaker remediation action",
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
      },
    },
    async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const { circuitBreakerActionEngine } = await import("../../services/circuitBreakerActionEngine.service.js");
        const actionConfig = await circuitBreakerActionEngine.getActionConfigById(id);
        if (!actionConfig) {
          return reply.code(404).send({ error: "Action configuration not found" });
        }

        const log = await circuitBreakerActionEngine.executeSingleAction(actionConfig, {
          alertType: actionConfig.alert_type,
          reason: "Manual test execution from API",
        });

        return { log };
      } catch (error) {
        logger.error({ err: error }, "Failed to test circuit breaker action config");
        return reply.code(500).send({ error: "Internal server error" });
      }
    }
  );

  fastify.get(
    "/action-logs",
    {
      schema: {
        tags: ["Circuit Breaker"],
        summary: "Get circuit breaker action execution logs",
        querystring: {
          type: "object",
          properties: {
            alert_type: { type: "string" },
            status: { type: "string" },
            action_config_id: { type: "string" },
            limit: { type: "integer", default: 50 },
            offset: { type: "integer", default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const query = request.query as any;
        const { circuitBreakerActionEngine } = await import("../../services/circuitBreakerActionEngine.service.js");
        const result = await circuitBreakerActionEngine.getActionLogs({
          alert_type: query.alert_type,
          status: query.status,
          action_config_id: query.action_config_id,
          limit: query.limit ? parseInt(query.limit, 10) : 50,
          offset: query.offset ? parseInt(query.offset, 10) : 0,
        });

        return result;
      } catch (error) {
        logger.error({ err: error }, "Failed to fetch circuit breaker action logs");
        return reply.code(500).send({ error: "Internal server error" });
      }
    }
  );
}

