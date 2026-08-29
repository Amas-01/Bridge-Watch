import { FastifyInstance } from "fastify";
import { MaintenanceCalendarService } from "../../services/maintenanceCalendar.service.js";
import { getDb } from "../../database/connection.js";

export async function maintenanceRoutes(fastify: FastifyInstance) {
  const db = getDb();
  const service = new MaintenanceCalendarService(db);

  fastify.get("/maintenance/upcoming", async (request, reply) => {
    try {
      const { days } = request.query as any;
      const windows = await service.getUpcomingMaintenance(
        days ? parseInt(days) : 7,
      );
      return { success: true, data: windows };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/maintenance/schedule", async (request, reply) => {
    try {
      const window = request.body as any;

      if (
        !window.data_source_id ||
        !window.title ||
        !window.scheduled_start ||
        !window.scheduled_end
      ) {
        return reply
          .code(400)
          .send({ success: false, error: "Missing required fields" });
      }

      const created = await service.scheduleMaintenanceWindow({
        ...window,
        scheduled_start: new Date(window.scheduled_start),
        scheduled_end: new Date(window.scheduled_end),
        status: "scheduled",
        impact_level: window.impact_level || "low",
        notify_users: window.notify_users !== false,
        metadata: window.metadata || {},
      });

      return { success: true, data: created };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/maintenance/:windowId/start", async (request, reply) => {
    try {
      const { windowId } = request.params as any;
      const window = await service.startMaintenance(windowId);
      return { success: true, data: window };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/maintenance/:windowId/complete", async (request, reply) => {
    try {
      const { windowId } = request.params as any;
      const window = await service.completeMaintenance(windowId);
      return { success: true, data: window };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.post("/maintenance/:windowId/cancel", async (request, reply) => {
    try {
      const { windowId } = request.params as any;
      const window = await service.cancelMaintenance(windowId);
      return { success: true, data: window };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });
}
