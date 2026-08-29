import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { registerRoutes } from "../../src/api/routes/index.js";

describe("Route Registration Integration", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({
      logger: false,
    });
    await registerRoutes(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("Core Routes Registration", () => {
    it("should register health routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("GET /api/v1/health");
      expect(routes).toContain("GET /health");
    });

    it("should register config routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("/api/v1/config");
    });

    it("should register preferences routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("/api/v1/preferences");
    });
  });

  describe("Asset Routes Registration", () => {
    it("should register asset routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("/api/v1/assets");
    });

    it("should register asset freshness routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("/api/v1/assets");
    });
  });

  describe("Bridge Routes Registration", () => {
    it("should register bridge routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("/api/v1/bridges");
    });

    it("should register bridge registry routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("/api/v1/bridges");
    });
  });

  describe("Alert Routes Registration", () => {
    it("should register alert routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("/api/v1/alerts");
    });

    it("should register alert suppression routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("/api/v1/alerts");
    });
  });

  describe("Reconciliation Routes Registration", () => {
    it("should register reconciliation routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("/api/v1/reconciliation");
    });
  });

  describe("Price Routes Registration", () => {
    it("should register price routes", async () => {
      const routes = app.printRoutes();
      expect(routes).toContain("/api/v1/prices");
    });
  });

  describe("Route Modularization", () => {
    it("should have registered routes from all domain groups", () => {
      const routes = app.printRoutes();
      const domainGroups = [
        "/api/v1/health",
        "/api/v1/assets",
        "/api/v1/bridges",
        "/api/v1/alerts",
        "/api/v1/incidents",
        "/api/v1/analytics",
        "/api/v1/prices",
        "/api/v1/reconciliation",
        "/api/v1/config",
        "/api/v1/preferences",
      ];

      domainGroups.forEach((group) => {
        expect(routes).toContain(group);
      });
    });

    it("should register routes without errors", async () => {
      expect(app).toBeDefined();
      expect(app.printRoutes()).toBeTruthy();
    });
  });
});
