import { FastifyInstance } from "fastify";
import { IncidentIngestionService } from "../../services/incidentIngestion.service.js";
import { IncidentService } from "../../services/incident.service.js";

export async function incidentsRoutes(fastify: FastifyInstance) {
  const service = new IncidentIngestionService();
  const incidentService = new IncidentService();

  fastify.get("/incidents", async (_request, reply) => {
    try {
      const { incidents } = await incidentService.listIncidents();
      return { success: true, data: incidents };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/incidents/ingest", async (request, reply) => {
    try {
      const { incident } = request.body as any;

      if (!incident) {
        return reply
          .code(400)
          .send({ success: false, error: "Missing required fields" });
      }

      const result = await service.ingest(incident);
      return { success: true, data: result };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/incidents/sources/:sourceId/poll", async (request, reply) => {
    try {
      const { sourceId } = request.params as any;
      return { success: true, data: { sourceId, status: "polled" } };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });
}
