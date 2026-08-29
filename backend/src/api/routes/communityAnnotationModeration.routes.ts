import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { communityAnnotationModerationService } from "../../services/communityAnnotationModeration.service.js";

interface ModerationBody {
  action: "approve" | "reject" | "review";
  reason?: string;
  moderatorId: string;
}

interface AnnotationParams {
  annotationId: string;
}

interface ListQuery {
  limit?: string;
}

export async function communityAnnotationModerationRoutes(server: FastifyInstance) {
  // Submit annotation for moderation review
  server.post<{ Params: AnnotationParams }>(
    "/:annotationId/submit-review",
    async (request: FastifyRequest<{ Params: AnnotationParams }>, reply: FastifyReply) => {
      try {
        const result = await communityAnnotationModerationService.submitForModeration(request.params.annotationId);
        return reply.code(201).send(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to submit annotation for review";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Moderate an annotation
  server.post<{ Params: AnnotationParams; Body: ModerationBody }>(
    "/:annotationId/moderate",
    async (request: FastifyRequest<{ Params: AnnotationParams; Body: ModerationBody }>, reply: FastifyReply) => {
      try {
        const { action, reason, moderatorId } = request.body;

        const log = await communityAnnotationModerationService.moderateAnnotation({
          annotationId: request.params.annotationId,
          action,
          reason,
          moderatorId,
        });

        return reply.code(200).send(log);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to moderate annotation";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get pending reviews
  server.get(
    "/pending-reviews",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const reviews = await communityAnnotationModerationService.getPendingReviews();
        return reply.send({ reviews });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch pending reviews";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Get moderation history for an annotation
  server.get<{ Params: AnnotationParams }>(
    "/:annotationId/history",
    async (request: FastifyRequest<{ Params: AnnotationParams }>, reply: FastifyReply) => {
      try {
        const history = await communityAnnotationModerationService.getModerationHistory(request.params.annotationId);
        return reply.send({ history });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch moderation history";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Get approved annotations
  server.get<{ Querystring: ListQuery }>(
    "/approved",
    async (request: FastifyRequest<{ Querystring: ListQuery }>, reply: FastifyReply) => {
      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;
        const approved = await communityAnnotationModerationService.getApprovedAnnotations(limit);
        return reply.send({ approved });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch approved annotations";
        return reply.code(500).send({ error: message });
      }
    }
  );
}
