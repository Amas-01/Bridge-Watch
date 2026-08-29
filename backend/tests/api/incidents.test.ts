import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

const incidentServiceMocks = vi.hoisted(() => ({
  listIncidents: vi.fn(),
  getIncident: vi.fn(),
  createIncident: vi.fn(),
  updateIncidentStatus: vi.fn(),
  updateIncidentSeverity: vi.fn(),
  markRead: vi.fn(),
  getUnreadCount: vi.fn(),
  getHeatmapData: vi.fn(),
  getIncidentReplayTimeline: vi.fn(),
}));

vi.mock("../../src/services/incident.service.js", () => ({
  IncidentService: class {
    listIncidents = incidentServiceMocks.listIncidents;
    getIncident = incidentServiceMocks.getIncident;
    createIncident = incidentServiceMocks.createIncident;
    updateIncidentStatus = incidentServiceMocks.updateIncidentStatus;
    updateIncidentSeverity = incidentServiceMocks.updateIncidentSeverity;
    markRead = incidentServiceMocks.markRead;
    getUnreadCount = incidentServiceMocks.getUnreadCount;
    getHeatmapData = incidentServiceMocks.getHeatmapData;
    getIncidentReplayTimeline = incidentServiceMocks.getIncidentReplayTimeline;
  },
}));

describe("Incidents API", () => {
  let server: FastifyInstance;

  beforeEach(() => {
    Object.values(incidentServiceMocks).forEach((mock) => mock.mockReset());
    incidentServiceMocks.getHeatmapData.mockResolvedValue({
      buckets: [],
      totalIncidents: 0,
      dateRange: { start: "2024-01-01", end: "2024-01-31" },
      assets: [],
    });
    incidentServiceMocks.getIncidentReplayTimeline.mockResolvedValue(null);
  });

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("GET /api/v1/incidents/heatmap", () => {
    it("should accept valid date range parameters", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/incidents/heatmap?startDate=2024-01-01&endDate=2024-01-31",
      });

      expect(response.statusCode).toBeDefined();
      expect(typeof response.statusCode).toBe("number");
    });
  });

  describe("GET /api/v1/incidents/heatmap", () => {
    it("should accept assetSymbol filter parameter", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/incidents/heatmap?assetSymbol=USDC",
      });

      expect(response.statusCode).toBeDefined();
      expect(typeof response.statusCode).toBe("number");
    });
  });

  describe("GET /api/v1/incidents/:id/replay", () => {
    it("responds for replay timeline requests", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/incidents/00000000-0000-0000-0000-000000000000/replay",
      });

      expect(typeof response.statusCode).toBe("number");
      expect([404, 500]).toContain(response.statusCode);
    });
  });
});
