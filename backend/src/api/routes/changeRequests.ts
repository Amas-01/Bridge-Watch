import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { ChangeApprovalService } from "../../services/changeApproval.service.js";
import type {
  ChangeRequestStatus,
  ChangeType,
} from "../../services/changeApproval.service.js";
import { logger } from "../../utils/logger.js";

/**
 * Admin routes for the operational change approval workflow.
 * Issue: #1060
 *
 * All endpoints require admin:change-requests scope.
 *
 * Registered at prefix: /api/v1/admin/change-requests
 */

const VALID_STATUSES: ChangeRequestStatus[] = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "applied",
  "cancelled",
];

const VALID_CHANGE_TYPES: ChangeType[] = [
  "config_update",
  "rule_change",
  "sampling_update",
  "other",
];

export async function changeRequestsRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:change-requests"] });
  const service = ChangeApprovalService.getInstance();

  // ---------------------------------------------------------------------------
  // GET /  — list all change requests, filterable by status
  // ---------------------------------------------------------------------------
  server.get<{
    Querystring: { status?: string; submittedBy?: string };
  }>(
    "/",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { status, submittedBy } = request.query;

      if (status && !VALID_STATUSES.includes(status as ChangeRequestStatus)) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `status must be one of: ${VALID_STATUSES.join(", ")}.`,
        });
      }

      try {
        const requests = await service.listRequests({
          status: status as ChangeRequestStatus | undefined,
          submittedBy,
        });
        return reply.code(200).send({ requests });
      } catch (err) {
        logger.error({ err }, "Failed to list change requests");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to retrieve change requests.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /  — create a draft change request
  // ---------------------------------------------------------------------------
  server.post<{
    Body: {
      title?: unknown;
      description?: unknown;
      changeType?: unknown;
      payload?: unknown;
    };
  }>(
    "/",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { title, description, changeType, payload } = request.body ?? {};

      if (!title || typeof title !== "string" || !title.trim()) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "title is required.",
        });
      }

      if (
        !description ||
        typeof description !== "string" ||
        !description.trim()
      ) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "description is required.",
        });
      }

      if (
        changeType !== undefined &&
        !VALID_CHANGE_TYPES.includes(changeType as ChangeType)
      ) {
        return reply.code(400).send({
          error: "Bad Request",
          message: `changeType must be one of: ${VALID_CHANGE_TYPES.join(", ")}.`,
        });
      }

      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        const changeRequest = await service.createDraft({
          title: title.trim(),
          description: description.trim(),
          changeType: (changeType as ChangeType) ?? "config_update",
          payload:
            payload && typeof payload === "object"
              ? (payload as Record<string, unknown>)
              : {},
          createdBy: actor,
        });
        return reply.code(201).send({ request: changeRequest });
      } catch (err) {
        logger.error({ err }, "Failed to create change request draft");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to create change request.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // GET /:id  — get a single change request
  // ---------------------------------------------------------------------------
  server.get<{ Params: { id: string } }>(
    "/:id",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;

      try {
        const changeRequest = await service.getById(id);
        if (!changeRequest) {
          return reply.code(404).send({
            error: "Not Found",
            message: `Change request not found: ${id}.`,
          });
        }
        return reply.code(200).send({ request: changeRequest });
      } catch (err) {
        logger.error({ err, id }, "Failed to get change request");
        return reply.code(500).send({
          error: "Internal Server Error",
          message: "Failed to retrieve change request.",
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /:id/submit  — submit draft for approval
  // ---------------------------------------------------------------------------
  server.post<{ Params: { id: string } }>(
    "/:id/submit",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        const changeRequest = await service.submitForApproval(id, actor);
        return reply.code(200).send({ request: changeRequest });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to submit change request.";
        const statusCode = message.includes("not found")
          ? 404
          : message.includes("status")
          ? 422
          : message.includes("creator")
          ? 403
          : 400;
        return reply.code(statusCode).send({
          error: statusCode === 404 ? "Not Found" : statusCode === 403 ? "Forbidden" : "Unprocessable Entity",
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /:id/approve  — approve a pending change request (four-eyes enforced)
  // ---------------------------------------------------------------------------
  server.post<{
    Params: { id: string };
    Body: { comment?: unknown };
  }>(
    "/:id/approve",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      const actor = request.apiKeyAuth?.name ?? "admin";
      const comment =
        request.body?.comment !== undefined
          ? String(request.body.comment)
          : undefined;

      try {
        const changeRequest = await service.approve(id, actor, comment);
        return reply.code(200).send({ request: changeRequest });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to approve change request.";
        const isFourEyes = message.includes("Four-eyes");
        const isNotFound = message.includes("not found");
        const isStateError = message.includes("status");
        const statusCode = isNotFound
          ? 404
          : isFourEyes
          ? 403
          : isStateError
          ? 422
          : 400;
        return reply.code(statusCode).send({
          error:
            statusCode === 404
              ? "Not Found"
              : statusCode === 403
              ? "Forbidden"
              : "Unprocessable Entity",
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /:id/reject  — reject a pending change request (comment required)
  // ---------------------------------------------------------------------------
  server.post<{
    Params: { id: string };
    Body: { comment?: unknown };
  }>(
    "/:id/reject",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      const actor = request.apiKeyAuth?.name ?? "admin";
      const comment = request.body?.comment;

      if (!comment || typeof comment !== "string" || !comment.trim()) {
        return reply.code(400).send({
          error: "Bad Request",
          message: "A review comment is required when rejecting a change request.",
        });
      }

      try {
        const changeRequest = await service.reject(id, actor, comment.trim());
        return reply.code(200).send({ request: changeRequest });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to reject change request.";
        const isNotFound = message.includes("not found");
        return reply.code(isNotFound ? 404 : 422).send({
          error: isNotFound ? "Not Found" : "Unprocessable Entity",
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /:id/apply  — apply an approved change request
  // ---------------------------------------------------------------------------
  server.post<{ Params: { id: string } }>(
    "/:id/apply",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        const changeRequest = await service.applyChange(id, actor);
        return reply.code(200).send({ request: changeRequest });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to apply change request.";
        const isNotFound = message.includes("not found");
        return reply.code(isNotFound ? 404 : 422).send({
          error: isNotFound ? "Not Found" : "Unprocessable Entity",
          message,
        });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // POST /:id/cancel  — cancel a draft or pending change request
  // ---------------------------------------------------------------------------
  server.post<{ Params: { id: string } }>(
    "/:id/cancel",
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params;
      const actor = request.apiKeyAuth?.name ?? "admin";

      try {
        const changeRequest = await service.cancelRequest(id, actor);
        return reply.code(200).send({ request: changeRequest });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to cancel change request.";
        const isNotFound = message.includes("not found");
        const isForbidden = message.includes("creator");
        const statusCode = isNotFound ? 404 : isForbidden ? 403 : 422;
        return reply.code(statusCode).send({
          error:
            statusCode === 404
              ? "Not Found"
              : statusCode === 403
              ? "Forbidden"
              : "Unprocessable Entity",
          message,
        });
      }
    }
  );
}
