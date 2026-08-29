import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { incidentEvidenceSearchService } from "../../services/incidentEvidenceSearch.service.js";

interface AddEvidenceBody {
  incidentId: string;
  content: string;
  author: string;
  severity: "low" | "medium" | "high" | "critical";
  tags: string[];
  evidenceType: string;
}

interface SearchQuery {
  q?: string;
  incidentId?: string;
  severity?: string;
  tags?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface EvidenceParams {
  id: string;
  incidentId: string;
}

interface UpdateBody {
  content?: string;
  severity?: "low" | "medium" | "high" | "critical";
  tags?: string[];
}

export async function incidentEvidenceSearchRoutes(server: FastifyInstance) {
  // Search incident evidence annotations
  server.get<{ Querystring: SearchQuery }>(
    "/search",
    async (request: FastifyRequest<{ Querystring: SearchQuery }>, reply: FastifyReply) => {
      try {
        const { q, incidentId, severity, tags, dateFrom, dateTo } = request.query;

        const results = await incidentEvidenceSearchService.searchEvidence(q || "", {
          incidentId,
          severity,
          tags: tags ? tags.split(",") : undefined,
          dateFrom: dateFrom ? new Date(dateFrom) : undefined,
          dateTo: dateTo ? new Date(dateTo) : undefined,
        });

        return reply.send({ results });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to search evidence";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Add evidence annotation to incident
  server.post<{ Body: AddEvidenceBody }>(
    "/add",
    async (request: FastifyRequest<{ Body: AddEvidenceBody }>, reply: FastifyReply) => {
      try {
        const { incidentId, content, author, severity, tags, evidenceType } = request.body;

        const annotation = await incidentEvidenceSearchService.addEvidenceAnnotation(
          incidentId,
          content,
          author,
          severity,
          tags,
          evidenceType
        );

        return reply.code(201).send(annotation);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to add evidence annotation";
        return reply.code(400).send({ error: message });
      }
    }
  );

  // Get all evidence for an incident
  server.get<{ Params: { incidentId: string } }>(
    "/incidents/:incidentId",
    async (request: FastifyRequest<{ Params: { incidentId: string } }>, reply: FastifyReply) => {
      try {
        const evidence = await incidentEvidenceSearchService.getIncidentEvidence(request.params.incidentId);
        return reply.send({ evidence });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch incident evidence";
        return reply.code(500).send({ error: message });
      }
    }
  );

  // Update evidence annotation
  server.patch<{ Params: EvidenceParams; Body: UpdateBody }>(
    "/:id",
    async (request: FastifyRequest<{ Params: EvidenceParams; Body: UpdateBody }>, reply: FastifyReply) => {
      try {
        const updated = await incidentEvidenceSearchService.updateEvidenceAnnotation(request.params.id, request.body);
        return reply.send(updated);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update evidence annotation";
        return reply.code(400).send({ error: message });
      }
    }
  );
}
