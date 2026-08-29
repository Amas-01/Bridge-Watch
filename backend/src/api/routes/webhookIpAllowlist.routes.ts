import type { FastifyInstance } from "fastify";
import { webhookIpAllowlistService } from "../../services/webhookIpAllowlist.service.js";

export async function webhookIpAllowlistRoutes(server: FastifyInstance) {
  server.get("/", async (request, reply) => {
    const { webhookEndpointId, direction, isActive } = request.query as {
      webhookEndpointId?: string;
      direction?: string;
      isActive?: string;
    };

    const entries = await webhookIpAllowlistService.listAllowlist({
      webhookEndpointId,
      direction,
      isActive: isActive !== undefined ? isActive === "true" : undefined,
    });
    return reply.send({ data: entries });
  });

  server.post("/", async (request, reply) => {
    const body = request.body as {
      webhookEndpointId?: string;
      ipOrCidr: string;
      description?: string;
      direction?: "inbound" | "outbound" | "both";
      createdBy?: string;
    };

    try {
      const entry = await webhookIpAllowlistService.addAllowlistEntry(body);
      return reply.status(201).send({ data: entry });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });

  server.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await webhookIpAllowlistService.getAllowlistEntry(id);
    if (!entry) {
      return reply.status(404).send({ error: "Not Found", message: "Allowlist entry not found" });
    }
    return reply.send({ data: entry });
  });

  server.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const success = await webhookIpAllowlistService.removeAllowlistEntry(id);
    if (!success) {
      return reply.status(404).send({ error: "Not Found", message: "Allowlist entry not found" });
    }
    return reply.send({ success: true, id });
  });

  server.patch("/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { isActive } = request.body as { isActive: boolean };

    if (isActive === undefined) {
      return reply.status(400).send({ error: "Bad Request", message: "isActive boolean is required" });
    }

    const updated = await webhookIpAllowlistService.toggleEntryStatus(id, isActive);
    if (!updated) {
      return reply.status(404).send({ error: "Not Found", message: "Allowlist entry not found" });
    }
    return reply.send({ data: updated });
  });

  server.post("/test", async (request, reply) => {
    const { ip, webhookEndpointId, direction } = request.body as {
      ip: string;
      webhookEndpointId?: string;
      direction?: string;
    };

    try {
      const result = await webhookIpAllowlistService.testIpAgainstAllowlist(ip, webhookEndpointId, direction);
      return reply.send({ data: result });
    } catch (err: any) {
      return reply.status(400).send({ error: "Bad Request", message: err.message });
    }
  });
}
