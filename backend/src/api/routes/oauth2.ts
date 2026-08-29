import type { FastifyInstance } from "fastify";
import { ApiKeyService } from "../../services/apiKey.service.js";
import { OAuth2Service } from "../../services/oauth2.service.js";
import { logger } from "../../utils/logger.js";

interface TokenRequestBody {
  grant_type: string;
  client_id: string;
  client_secret: string;
  scope?: string;
}

function isValidClientId(clientId: string): boolean {
  if (clientId.length !== 35) return false;
  if (!clientId.startsWith("bw_")) return false;
  const hex = clientId.substring(3);
  return hex.length === 32 && /^[a-f0-9]+$/.test(hex);
}

function isValidClientSecret(clientSecret: string): boolean {
  if (clientSecret.length !== 68) return false;
  if (!clientSecret.startsWith("bws_")) return false;
  const hex = clientSecret.substring(4);
  return hex.length === 64 && /^[a-f0-9]+$/.test(hex);
}

export async function oauth2Routes(server: FastifyInstance) {
  const apiKeyService = new ApiKeyService();
  const oauth2Service = new OAuth2Service();

  server.post<{ Body: TokenRequestBody }>(
    "/token",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
        },
      },
      schema: {
        description: "OAuth2 Client Credentials Flow - Issue access token",
        tags: ["OAuth2"],
        body: {
          type: "object",
          required: ["grant_type", "client_id", "client_secret"],
          properties: {
            grant_type: {
              type: "string",
              enum: ["client_credentials"],
              description: "Must be 'client_credentials'",
              maxLength: 50,
            },
            client_id: {
              type: "string",
              description: "OAuth2 client identifier",
              maxLength: 100,
            },
            client_secret: {
              type: "string",
              description: "OAuth2 client secret",
              maxLength: 200,
            },
            scope: {
              type: "string",
              description:
                "Space-separated list of requested scopes (optional)",
              maxLength: 500,
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              access_token: { type: "string" },
              token_type: { type: "string" },
              expires_in: { type: "number" },
              scope: { type: "string" },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
              error_description: { type: "string" },
            },
          },
          401: {
            type: "object",
            properties: {
              error: { type: "string" },
              error_description: { type: "string" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { grant_type, client_id, client_secret, scope } = request.body;

      if (grant_type !== "client_credentials") {
        return reply.code(400).send({
          error: "unsupported_grant_type",
          error_description:
            "Only 'client_credentials' grant type is supported",
        });
      }

      if (!client_id || !client_secret) {
        return reply.code(400).send({
          error: "invalid_request",
          error_description: "Missing client_id or client_secret",
        });
      }

      if (!isValidClientId(client_id)) {
        return reply.code(400).send({
          error: "invalid_request",
          error_description: "Invalid client_id format",
        });
      }

      if (!isValidClientSecret(client_secret)) {
        return reply.code(400).send({
          error: "invalid_request",
          error_description: "Invalid client_secret format",
        });
      }

      try {
        const apiKey =
          await apiKeyService.validateOAuth2ClientCredentials(
            client_id,
            client_secret
          );

        if (!apiKey) {
          logger.warn(
            { event: "oauth2_invalid_credentials" },
            "OAuth2 token request failed: invalid credentials"
          );
          return reply.code(401).send({
            error: "invalid_client",
            error_description: "Invalid client credentials",
          });
        }

        const requestedScopes = scope
          ? scope
              .trim()
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 20)
          : [];

        const grantedScopes =
          requestedScopes.length > 0
            ? apiKey.scopes.filter(
                (s) =>
                  requestedScopes.includes(s) || apiKey.scopes.includes("*")
              )
            : apiKey.scopes;

        if (requestedScopes.length > 0 && grantedScopes.length === 0) {
          return reply.code(400).send({
            error: "invalid_scope",
            error_description:
              "Requested scopes are not authorized for this client",
          });
        }

        const token = oauth2Service.issueToken(
          client_id,
          apiKey.id,
          grantedScopes
        );

        logger.info(
          {
            event: "oauth2_token_issued",
          },
          "OAuth2 access token issued"
        );

        return reply.code(200).send({
          access_token: token.accessToken,
          token_type: token.tokenType,
          expires_in: token.expiresIn,
          scope: grantedScopes.join(" "),
        });
      } catch (error) {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
            event: "oauth2_token_error",
          },
          "OAuth2 token issuance failed"
        );
        return reply.code(500).send({
          error: "server_error",
          error_description: "Failed to issue access token",
        });
      }
    }
  );
}
