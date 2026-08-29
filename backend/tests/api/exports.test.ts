import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { buildServer } from "../../src/index.js";
import type { FastifyInstance } from "fastify";

const exportServiceMocks = vi.hoisted(() => ({
  requestExport: vi.fn(),
  listExports: vi.fn(),
  getExportStatus: vi.fn(),
  generateDownloadUrl: vi.fn(),
  deleteExport: vi.fn(),
}));

vi.mock("../../src/services/export.service.js", () => ({
  ExportService: class {
    requestExport = exportServiceMocks.requestExport;
    listExports = exportServiceMocks.listExports;
    getExportStatus = exportServiceMocks.getExportStatus;
    generateDownloadUrl = exportServiceMocks.generateDownloadUrl;
    deleteExport = exportServiceMocks.deleteExport;
  },
}));

describe("Exports API", () => {
  let server: FastifyInstance;

  beforeEach(() => {
    Object.values(exportServiceMocks).forEach((mock) => mock.mockReset());
    exportServiceMocks.requestExport.mockImplementation(async (userId, body: any) => {
      if (!body || !body.format || !body.dataType) {
        throw new Error("Missing required fields");
      }
      return { id: "export-123", status: "pending" };
    });
    exportServiceMocks.listExports.mockResolvedValue([{ id: "export-123", status: "pending" }]);
    exportServiceMocks.getExportStatus.mockImplementation(async (id) => {
      if (id === "non-existent-id") return null;
      return { id, status: "completed" };
    });
    exportServiceMocks.generateDownloadUrl.mockImplementation(async (id) => {
      if (id === "non-existent-id") throw new Error("Export not found");
      return "http://download.url";
    });
    exportServiceMocks.deleteExport.mockImplementation(async (id) => {
      if (id === "non-existent-id") throw new Error("Export not found");
      return true;
    });
  });

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("POST /api/v1/exports", () => {
    it("should return 400 when required fields are missing", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/exports",
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it("should create an export and return 201", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/v1/exports",
        payload: {
          format: "json",
          dataType: "analytics",
          filters: {
            startDate: "2025-01-01",
            endDate: "2025-01-31",
          },
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("export");
    });
  });

  describe("GET /api/v1/exports", () => {
    it("should return a list of exports", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/exports",
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty("exports");
    });
  });

  describe("GET /api/v1/exports/:exportId", () => {
    it("should return 404 for a non-existent export", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/exports/non-existent-id",
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe("GET /api/v1/exports/:exportId/download", () => {
    it("should return 400 for a non-existent export", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/exports/non-existent-id/download",
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/v1/exports/:exportId", () => {
    it("should return 400 for a non-existent export", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: "/api/v1/exports/non-existent-id",
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
