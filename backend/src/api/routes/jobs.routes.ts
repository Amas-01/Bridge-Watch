import { FastifyInstance } from "fastify";
import { JobDependencyService } from "../../services/jobDependency.service.js";
import { getDb } from "../../database/connection.js";

export async function jobsRoutes(fastify: FastifyInstance) {
  const db = getDb();
  const service = new JobDependencyService(db);

  fastify.post("/jobs/:executionId/cancel", async (request, reply) => {
    try {
      const { executionId } = request.params as any;
      const { reason, cancelled_by, cascade } = request.body as any;

      if (!reason) {
        return reply
          .code(400)
          .send({ success: false, error: "Cancellation reason is required" });
      }

      const result = await service.cancelJobExecution(
        executionId,
        reason,
        cancelled_by || "system",
        cascade !== false,
      );

      return { success: true, data: result };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.get("/jobs/:executionId/status", async (request, reply) => {
    try {
      const { executionId } = request.params as any;
      const execution = await service.getExecutionStatus(executionId);

      if (!execution) {
        return reply
          .code(404)
          .send({ success: false, error: "Execution not found" });
      }

      return { success: true, data: execution };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });

  fastify.get("/jobs/:executionId/dependencies", async (request, reply) => {
    try {
      const { executionId } = request.params as any;
      const dependencies = await service.getExecutionDependencies(executionId);
      return { success: true, data: dependencies };
    } catch (error: any) {
      fastify.log.error(error);
      return reply.code(500).send({ success: false, error: error.message });
    }
  });
}
