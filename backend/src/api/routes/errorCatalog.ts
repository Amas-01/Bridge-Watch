import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { ErrorCatalogService } from "../../services/errorCatalog.service.js";
import type { ErrorSeverity, ErrorCategory } from "../../services/errorCatalog.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Routes for the structured error catalog.
 * Issue: #1059
 *
 * Admin CRUD endpoints: POST, PATCH, DELETE — require admin:error-catalog scope.
 * Public lookup:        GET /:errorCode     — requires any authenticated scope.
 *
 * Registered at prefix: /api/v1/admin/error-catalog  (admin endpoints)
 *                        /api/v1/error-catalog        (authenticated lookup — registered separately)
 *
 * Both route functions are exported so admin-routes.ts and a public route
 * group can register them independently.
 */

const VALID_SEVERITIES: ErrorSeverity[] = ["info", "warning", "error", "critical"];
const VALID_CATEGORIES: ErrorCategory[] = [
  "network",
  "auth",
  "validation",
  "bridge",
  "rate_limit",
  "internal",
];

/**
 * Admin-only CRUD routes for error catalog management.
 * Registered at: /api/v1/admin/error-catalog
 */
export async function errorCatalogAdminRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:error-catalog"] });
  const service = ErrorCatalogService.getInstance();

  // ---------------------------------------------------------------------------
  // GET /  — list entries, filterable by severity and category
  // ---------------------------------------------------------------------------
  server.get<{
    Querystring: {
      severity?: string;
      category?: string;
      includeInactive?: string;
    };
  }>(
    "/",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { severity, category, includeInactive } = request.query;

      if (severity && !VALID_SEVERITIES.includes(severity as ErrorSeverity)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `severity must be one of: ${VALID_SEVERITIES.join(", ")}.`,
        });
      }

      if (category && !VALID_CATEGORIES.includes(category as ErrorCategory)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `category must be one of: ${VALID_CATEGORIES.join(", ")}.`,
        });
      }

      try {
        const entries = await service.listEntries({
          severity: severity as ErrorSeverity | undefined,
          category: category as ErrorCategory | undefined,
          includeInactive: includeInactive === "true",
        });
        return reply.code(200).send({ entries });
      } catch (err) {
        logger.error({ err }, "Failed to list error catalog entries");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to retrieve error catalog entries.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /  — create a new catalog entry
  // ---------------------------------------------------------------------------
  server.post<{
    Body: {
      errorCode?: unknown;
      title?: unknown;
      messageTemplate?: unknown;
      httpStatus?: unknown;
      severity?: unknown;
      category?: unknown;
      retryGuidance?: unknown;
      documentationUrl?: unknown;
    };
  }>(
    "/",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const {
        errorCode,
        title,
        messageTemplate,
        httpStatus,
        severity,
        category,
        retryGuidance,
        documentationUrl,
      } = request.body ?? {};

      if (!errorCode || typeof errorCode !== "string" || !errorCode.trim()) {
        return reply.code(400).send({ error: "Bad Request", message: "errorCode is required." });
      }
      if (!title || typeof title !== "string" || !title.trim()) {
        return reply.code(400).send({ error: "Bad Request", message: "title is required." });
      }
      if (
        !messageTemplate ||
        typeof messageTemplate !== "string" ||
        !messageTemplate.trim()
      ) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "messageTemplate is required.",
        });
      }

      const status = Number(httpStatus);
      if (!httpStatus || isNaN(status) || status < 100 || status > 599) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "httpStatus must be a valid HTTP status code (100–599).",
        });
      }

      if (severity && !VALID_SEVERITIES.includes(severity as ErrorSeverity)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `severity must be one of: ${VALID_SEVERITIES.join(", ")}.`,
        });
      }

      if (category && !VALID_CATEGORIES.includes(category as ErrorCategory)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `category must be one of: ${VALID_CATEGORIES.join(", ")}.`,
        });
      }

      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        const entry = await service.createEntry({
          errorCode: errorCode.trim().toUpperCase(),
          title: (title as string).trim(),
          messageTemplate: (messageTemplate as string).trim(),
          httpStatus: status,
          severity: severity as ErrorSeverity | undefined,
          category: category as ErrorCategory | undefined,
          retryGuidance:
            typeof retryGuidance === "string" ? retryGuidance : undefined,
          documentationUrl:
            typeof documentationUrl === "string" ? documentationUrl : undefined,
          createdBy: actor,
        });
        return reply.code(201).send({ entry });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to create entry.";
        const isDuplicate = message.includes("already exists");
        return reply.code(isDuplicate ? 409 : 500).send({
          error: isDuplicate ? "Conflict" : "Internal Server Error",
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // PATCH /:id  — update a catalog entry
  // ---------------------------------------------------------------------------
  server.patch<{
    Params: { id: string };
    Body: {
      title?: unknown;
      messageTemplate?: unknown;
      httpStatus?: unknown;
      severity?: unknown;
      category?: unknown;
      retryGuidance?: unknown;
      documentationUrl?: unknown;
      isActive?: unknown;
    };
  }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      const actor = request.apiKeyAuth?.name ?? "admin";

      const {
        title,
        messageTemplate,
        httpStatus,
        severity,
        category,
        retryGuidance,
        documentationUrl,
        isActive,
      } = request.body ?? {};

      if (httpStatus !== undefined) {
        const status = Number(httpStatus);
        if (isNaN(status) || status < 100 || status > 599) {
          return reply.code(400).send({
            error: "Bad Request",
            message: "httpStatus must be a valid HTTP status code (100–599).",
          });
        }
      }

      if (severity && !VALID_SEVERITIES.includes(severity as ErrorSeverity)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `severity must be one of: ${VALID_SEVERITIES.join(", ")}.`,
        });
      }

      if (category && !VALID_CATEGORIES.includes(category as ErrorCategory)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `category must be one of: ${VALID_CATEGORIES.join(", ")}.`,
        });
      }

      // Allow reactivating via PATCH isActive=true
      if (isActive === true) {
        const db = (await import("../../database/connection.js")).getDatabase();
        await db("error_catalog")
          .where("id", id)
          .update({ is_active: true, updated_by: actor, updated_at: new Date() });
      }

      try {
        const entry = await service.updateEntry(
          id,
          {
            title: title !== undefined ? String(title) : undefined,
            messageTemplate:
              messageTemplate !== undefined ? String(messageTemplate) : undefined,
            httpStatus:
              httpStatus !== undefined ? Number(httpStatus) : undefined,
            severity: severity as ErrorSeverity | undefined,
            category: category as ErrorCategory | undefined,
            retryGuidance:
              retryGuidance !== undefined ? String(retryGuidance) : undefined,
            documentationUrl:
              documentationUrl !== undefined
                ? String(documentationUrl)
                : undefined,
          },
          actor
        );
        return reply.code(200).send({ entry });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to update entry.";
        return reply.code(message.includes("not found") ? 404 : 500).send({
          error: message.includes("not found") ? "Not Found" : "Internal Server Error",
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // DELETE /:id  — soft-deactivate a catalog entry
  // ---------------------------------------------------------------------------
  server.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        await service.deactivateEntry(id, actor);
        return reply.code(200).send({ message: "Error catalog entry deactivated." });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to deactivate entry.";
        return reply.code(message.includes("not found") ? 404 : 500).send({
          error: message.includes("not found") ? "Not Found" : "Internal Server Error",
          message,
        });
      }
    }
  );
}

/**
 * Authenticated (non-admin) lookup route.
 * Registered at: /api/v1/error-catalog
 *
 * Any authenticated caller may look up an error code to resolve its details.
 */
export async function errorCatalogPublicRoutes(server: FastifyInstance) {
  const requireAuth = authMiddleware({});
  const service = ErrorCatalogService.getInstance();

  // GET /:errorCode — public authenticated lookup
  server.get<{ Params: { errorCode: string } }>(
    "/:errorCode",
    { preHandler: requireAuth },
    async (request, reply) => {
      const { errorCode } = request.params;

      try {
        const entry = await service.getCatalogEntry(errorCode.toUpperCase());
        if (!entry) {
          return reply.code(404).send({
            error: "Not Found",
            message: `No active catalog entry found for error code: ${errorCode}.`,
          });
        }
        return reply.code(200).send({ entry });
      } catch (err) {
        logger.error({ err }, "Failed to look up error catalog entry");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to retrieve error catalog entry.",
        });
      }
    }
  );
}
