import type { FastifyInstance } from "fastify";
import { sensitiveFieldAccessService } from "../../services/sensitiveFieldAccess.service.js";

export async function sensitiveFieldAccessRoutes(server: FastifyInstance) {
  server.get("/definitions", async (request, reply) => {
    const definitions = await sensitiveFieldAccessService.listDefinitions();
    return reply.send({ data: definitions });
  });

  server.post("/definitions", async (request, reply) => {
    const body = request.body as {
      resourceName: string;
      fieldName: string;
      sensitivityLevel?: "low" | "medium" | "high" | "critical";
      description?: string;
    };

    try {
      const created = await sensitiveFieldAccessService.createDefinition(body);
      return reply.status(201).send({ data: created });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  server.get("/access-logs", async (request, reply) => {
    const { resourceName, fieldName, actorId, accessType, limit } = request.query as {
      resourceName?: string;
      fieldName?: string;
      actorId?: string;
      accessType?: string;
      limit?: string;
    };

    const logs = await sensitiveFieldAccessService.queryLogs({
      resourceName,
      fieldName,
      actorId,
      accessType,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return reply.send({ data: logs });
  });

  server.post("/access-logs", async (request, reply) => {
    const body = request.body as {
      resourceName: string;
      fieldName: string;
      actorId: string;
      actorRole?: string;
      accessType?: "read" | "export" | "decrypted" | "modified";
      reason?: string;
    };

    try {
      const log = await sensitiveFieldAccessService.logAccess({
        ...body,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });
      return reply.status(201).send({ data: log });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  server.get("/reports", async (request, reply) => {
    const reports = await sensitiveFieldAccessService.listReports();
    return reply.send({ data: reports });
  });

  server.post("/reports/generate", async (request, reply) => {
    const body = request.body as {
      title: string;
      timeRangeStart: string;
      timeRangeEnd: string;
      sensitivityFilter?: string;
      generatedBy?: string;
    };

    try {
      const report = await sensitiveFieldAccessService.generateReport(body);
      return reply.status(201).send({ data: report });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  server.get("/reports/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const report = await sensitiveFieldAccessService.getReportById(id);
    if (!report) {
      return reply.status(404).send({ error: "Not Found", message: "Report not found" });
    }
    return reply.send({ data: report });
  });
}
