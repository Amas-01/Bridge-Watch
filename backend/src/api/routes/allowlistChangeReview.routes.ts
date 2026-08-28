import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { allowlistChangeReviewService } from "../../services/allowlistChangeReview.service.js";
import { logger } from "../../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

interface SubmitChangeRequestBody {
  contractAddress: string;
  action: "add" | "remove";
  reason: string;
}

interface ReviewRequestBody {
  decision: "approved" | "rejected";
  comment?: string;
}

interface ChangeRequestIdParams {
  id: string;
}

interface ListChangeRequestsQuery {
  status?: "pending" | "approved" | "rejected";
}

// =============================================================================
// ROUTES
// =============================================================================

export async function allowlistChangeReviewRoutes(server: FastifyInstance) {
  const requireAdmin = authMiddleware({ requiredScopes: ["admin:allowlist"] });

  // ---------------------------------------------------------------------------
  // GET CURRENT ALLOWLIST — List all active allowlist entries
  // ---------------------------------------------------------------------------

  server.get(
    "/",
    { preHandler: requireAdmin } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const allowlist = await allowlistChangeReviewService.getCurrentAllowlist();

        return {
          allowlist,
          total: allowlist.length,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to get allowlist";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // SUBMIT CHANGE REQUEST — Create a new change request
  // ---------------------------------------------------------------------------

  server.post<{ Body: SubmitChangeRequestBody }>(
    "/change-requests",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Body: SubmitChangeRequestBody }>,
      reply: FastifyReply
    ) => {
      try {
        const { contractAddress, action, reason } = request.body;

        if (!contractAddress || !action || !reason) {
          return reply.code(400).send({
            error: "contractAddress, action, and reason are required",
          });
        }

        if (action !== "add" && action !== "remove") {
          return reply.code(400).send({
            error: "action must be 'add' or 'remove'",
          });
        }

        const requestedBy = (request as any).apiKeyAuth?.id || "unknown";

        const changeRequest = await allowlistChangeReviewService.submitChangeRequest(
          { contractAddress, action, reason },
          requestedBy
        );

        return reply.code(201).send({ changeRequest });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to submit change request";
        logger.error({ error }, message);
        return reply.code(400).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // LIST CHANGE REQUESTS — Get change requests by status
  // ---------------------------------------------------------------------------

  server.get<{ Querystring: ListChangeRequestsQuery }>(
    "/change-requests",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Querystring: ListChangeRequestsQuery }>,
      reply: FastifyReply
    ) => {
      try {
        const { status } = request.query;

        const changeRequests = await allowlistChangeReviewService.listChangeRequests(
          status
        );

        return {
          changeRequests,
          total: changeRequests.length,
          status: status || "all",
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to list change requests";
        logger.error({ error }, message);
        return reply.code(500).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // REVIEW CHANGE REQUEST — Approve or reject a change request
  // ---------------------------------------------------------------------------

  server.post<{ Params: ChangeRequestIdParams; Body: ReviewRequestBody }>(
    "/change-requests/:id/review",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{
        Params: ChangeRequestIdParams;
        Body: ReviewRequestBody;
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const { decision, comment } = request.body;

        if (!decision) {
          return reply.code(400).send({ error: "decision is required" });
        }

        if (decision !== "approved" && decision !== "rejected") {
          return reply.code(400).send({
            error: "decision must be 'approved' or 'rejected'",
          });
        }

        const reviewedBy = (request as any).apiKeyAuth?.id || "unknown";

        const changeRequest = await allowlistChangeReviewService.reviewRequest(
          id,
          decision,
          reviewedBy,
          comment
        );

        return { changeRequest };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to review request";
        logger.error({ error }, message);

        // Four-eyes check failure returns 403
        if (message.includes("four-eyes")) {
          return reply.code(403).send({ error: message });
        }

        return reply.code(400).send({ error: message });
      }
    }
  );

  // ---------------------------------------------------------------------------
  // APPLY CHANGE — Apply an approved change to the allowlist
  // ---------------------------------------------------------------------------

  server.post<{ Params: ChangeRequestIdParams }>(
    "/change-requests/:id/apply",
    { preHandler: requireAdmin } as any,
    async (
      request: FastifyRequest<{ Params: ChangeRequestIdParams }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const appliedBy = (request as any).apiKeyAuth?.id || "unknown";

        await allowlistChangeReviewService.applyApprovedChange(id, appliedBy);

        return {
          message: "Change applied successfully",
          id,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to apply change";
        logger.error({ error }, message);
        return reply.code(400).send({ error: message });
      }
    }
  );
}
