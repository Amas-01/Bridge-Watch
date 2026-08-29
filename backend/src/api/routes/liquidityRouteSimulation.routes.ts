import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { liquidityRouteSimulationService } from "../../services/liquidityRouteSimulation.service.js";
import { authMiddleware } from "../middleware/auth.js";

export async function liquidityRouteSimulationRoutes(server: FastifyInstance) {
  server.addHook("preHandler", authMiddleware());

  server.post(
    "/simulate",
    {
      schema: {
        tags: ["Liquidity Route Simulation"],
        summary: "Simulate a liquidity route between two assets",
        body: {
          type: "object",
          required: ["ownerAddress", "sourceAsset", "targetAsset", "inputAmount"],
          properties: {
            ownerAddress: { type: "string" },
            sourceAsset: { type: "string" },
            targetAsset: { type: "string" },
            inputAmount: { type: "number" },
            constraints: {
              type: "object",
              properties: {
                maxHops: { type: "integer", default: 3 },
                maxSlippagePct: { type: "number" },
                excludedPools: { type: "array", items: { type: "string" } },
                minLiquidity: { type: "number" },
              },
            },
          },
        },
        response: { 200: { type: "object", properties: { simulation: { type: "object" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as {
        ownerAddress: string;
        sourceAsset: string;
        targetAsset: string;
        inputAmount: number;
        constraints?: { maxHops?: number; maxSlippagePct?: number; excludedPools?: string[]; minLiquidity?: number };
      };
      const result = await liquidityRouteSimulationService.simulate(
        body.ownerAddress,
        body.sourceAsset,
        body.targetAsset,
        body.inputAmount,
        body.constraints,
      );
      return reply.send({ simulation: result });
    },
  );

  server.get(
    "/:id",
    {
      schema: {
        tags: ["Liquidity Route Simulation"],
        summary: "Get a simulation result",
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } } },
        response: { 200: { type: "object", properties: { simulation: { type: "object" } } }, 404: { type: "object" } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const result = await liquidityRouteSimulationService.getSimulation(id);
      if (!result) return reply.status(404).send({ error: "Simulation not found" });
      return reply.send({ simulation: result });
    },
  );

  server.get(
    "/",
    {
      schema: {
        tags: ["Liquidity Route Simulation"],
        summary: "List simulations for an owner",
        querystring: {
          type: "object",
          required: ["owner"],
          properties: {
            owner: { type: "string" },
            limit: { type: "integer", default: 20 },
            offset: { type: "integer", default: 0 },
          },
        },
        response: { 200: { type: "object", properties: { simulations: { type: "array" }, total: { type: "integer" } } } },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { owner, limit, offset } = request.query as { owner: string; limit?: number; offset?: number };
      const result = await liquidityRouteSimulationService.listSimulations(owner, limit, offset);
      return reply.send(result);
    },
  );
}
