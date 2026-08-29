import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const jobMocks = vi.hoisted(() => ({
  runSorobanBatchPlannerCycle: vi.fn(),
  getSorobanBatchPlannerStatus: vi.fn(),
}));

vi.mock("../../src/jobs/sorobanBatchPlanner.job.js", () => ({
  runSorobanBatchPlannerCycle: jobMocks.runSorobanBatchPlannerCycle,
  getSorobanBatchPlannerStatus: jobMocks.getSorobanBatchPlannerStatus,
}));

import { sorobanBatchPlannerRoutes } from "../../src/api/routes/sorobanBatchPlanner.routes.js";

const validItem = {
  id: "a",
  idempotencyKey: "key-a",
  contractId: "CBRIDGE",
  functionName: "submit_health_batch",
};

describe("Soroban batch planner API", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    server = Fastify();
    await server.register(sorobanBatchPlannerRoutes);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  describe("POST /plan", () => {
    it("runs a cycle for valid items and returns the report", async () => {
      const report = { jobId: "j1", plannedItems: 1, confirmedItems: ["a"] };
      jobMocks.runSorobanBatchPlannerCycle.mockResolvedValueOnce(report);

      const response = await server.inject({ method: "POST", url: "/plan", payload: { items: [validItem] } });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(report);
      expect(jobMocks.runSorobanBatchPlannerCycle).toHaveBeenCalledWith([validItem]);
    });

    it("rejects malformed items with a 400 instead of forwarding them to the planner", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/plan",
        payload: { items: [{ id: "a" }] },
      });

      expect(response.statusCode).toBe(400);
      expect(jobMocks.runSorobanBatchPlannerCycle).not.toHaveBeenCalled();
    });

    it("treats a missing body as an empty batch", async () => {
      const report = { jobId: "j2", plannedItems: 0 };
      jobMocks.runSorobanBatchPlannerCycle.mockResolvedValueOnce(report);

      const response = await server.inject({ method: "POST", url: "/plan", payload: {} });

      expect(response.statusCode).toBe(200);
      expect(jobMocks.runSorobanBatchPlannerCycle).toHaveBeenCalledWith([]);
    });
  });

  describe("GET /status", () => {
    it("returns the current lifecycle ledger snapshot", async () => {
      const status = { totalItems: 3, byState: { confirmed: 2, retry_scheduled: 1 }, items: [] };
      jobMocks.getSorobanBatchPlannerStatus.mockReturnValueOnce(status);

      const response = await server.inject({ method: "GET", url: "/status" });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual(status);
    });
  });
});
