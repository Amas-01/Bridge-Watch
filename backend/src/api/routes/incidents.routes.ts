import { FastifyInstance } from "fastify";
import { IncidentIngestionService } from "../../services/incidentIngestion.service.js";
import { getDatabase } from "../../database/connection.js";

export async function incidentsRoutes(fastify: FastifyInstance) {
  const db = getDatabase();
  const service = new IncidentIngestionService(db);

  fastify.get("/incidents", async (request, reply) => {
    try {
      const incidents = await service.getActiveIncidents();
      return { success: true, data: incidents };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/incidents/ingest", async (request, reply) => {
    try {
      const { source, incident } = request.body as any;

      if (!source || !incident) {
        return reply
          .code(400)
          .send({ success: false, error: "Missing required fields" });
      }

      const result = await service.ingestIncident(source, incident);
      return { success: true, data: result };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/incidents/sources/:sourceId/poll", async (request, reply) => {
    try {
      const { sourceId } = request.params as any;
      const result = await service.pollSource(sourceId);
      return { success: true, data: result };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });
}
