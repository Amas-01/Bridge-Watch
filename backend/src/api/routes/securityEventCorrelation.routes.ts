import type { FastifyInstance } from "fastify";
import { securityEventCorrelationService } from "../../services/securityEventCorrelation.service.js";

export async function securityEventCorrelationRoutes(server: FastifyInstance) {
  server.get("/", async (request, reply) => {
    const { severity, status, search } = request.query as {
      severity?: string;
      status?: string;
      search?: string;
    };
    const items = await securityEventCorrelationService.listCorrelations({ severity, status, search });
    return reply.send({ data: items });
  });

  server.post("/", async (request, reply) => {
    const body = request.body as {
      title: string;
      description?: string;
      severity?: "low" | "medium" | "high" | "critical";
      correlationRule?: Record<string, unknown>;
      sourceSystems?: string[];
      timeWindowMinutes?: number;
      createdBy?: string;
    };

    try {
      const created = await securityEventCorrelationService.createCorrelation(body);
      return reply.status(201).send({ data: created });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  server.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const correlation = await securityEventCorrelationService.getCorrelationById(id);
    if (!correlation) {
      return reply.status(404).send({ error: "Not Found", message: "Correlation view not found" });
    }
    return reply.send({ data: correlation });
  });

  server.patch("/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, updatedBy } = request.body as {
      status: "active" | "investigating" | "resolved" | "archived";
      updatedBy?: string;
    };

    if (!status) {
      return reply.status(400).send({ error: "Bad Request", message: "status is required" });
    }

    const updated = await securityEventCorrelationService.updateCorrelationStatus(id, status, updatedBy);
    if (!updated) {
      return reply.status(404).send({ error: "Not Found", message: "Correlation view not found" });
    }
    return reply.send({ data: updated });
  });

  server.get("/events/raw", async (request, reply) => {
    const { correlationId, eventType, source, severity, actor, limit } = request.query as {
      correlationId?: string;
      eventType?: string;
      source?: string;
      severity?: string;
      actor?: string;
      limit?: string;
    };

    const events = await securityEventCorrelationService.listSecurityEvents({
      correlationId,
      eventType,
      source,
      severity,
      actor,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return reply.send({ data: events });
  });

  server.post("/events/ingest", async (request, reply) => {
    const body = request.body as {
      correlationId?: string;
      eventType: string;
      source: string;
      severity?: "low" | "medium" | "high" | "critical";
      actor?: string;
      ipAddress?: string;
      details?: Record<string, unknown>;
    };

    try {
      const event = await securityEventCorrelationService.ingestSecurityEvent(body);
      return reply.status(201).send({ data: event });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });
}
