import { describe, it, expect, beforeEach, vi } from "vitest";
import { queryPerformanceService } from "../queryPerformance.service.js";

describe("queryPerformanceService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logQueryExecution", () => {
    it("should log a successful query execution", async () => {
      const log = await queryPerformanceService.logQueryExecution(
        "query_hash_123",
        "SELECT * FROM users",
        "prod_db",
        150.5,
        10,
        100,
        "success"
      );

      expect(log).toBeDefined();
      expect(log.queryHash).toBe("query_hash_123");
      expect(log.executionTimeMs).toBe(150.5);
      expect(log.status).toBe("success");
    });

    it("should log a failed query execution", async () => {
      const log = await queryPerformanceService.logQueryExecution(
        "query_hash_456",
        "SELECT * FROM invalid_table",
        "staging_db",
        0,
        0,
        0,
        "failed",
        "Table not found"
      );

      expect(log).toBeDefined();
      expect(log.status).toBe("failed");
      expect(log.errorMessage).toBe("Table not found");
    });
  });

  describe("analyzeQuery", () => {
    it("should analyze query performance", async () => {
      await queryPerformanceService.logQueryExecution(
        "query_hash_789",
        "SELECT * FROM orders",
        "prod_db",
        100,
        50,
        500
      );

      const analysis = await queryPerformanceService.analyzeQuery("query_hash_789");

      expect(analysis).toBeDefined();
      expect(analysis.queryHash).toBe("query_hash_789");
      expect(analysis.avgExecutionTimeMs).toBeDefined();
      expect(analysis.recommendations).toBeInstanceOf(Array);
    });

    it("should provide recommendations for slow queries", async () => {
      await queryPerformanceService.logQueryExecution(
        "slow_query_hash",
        "SELECT * FROM large_table",
        "prod_db",
        2000,
        1000,
        50000
      );

      const analysis = await queryPerformanceService.analyzeQuery("slow_query_hash");

      expect(analysis.recommendations.length).toBeGreaterThan(0);
      expect(analysis.avgExecutionTimeMs).toBeGreaterThan(1000);
    });
  });

  describe("getSlowQueries", () => {
    it("should fetch slow queries with pagination", async () => {
      const queries = await queryPerformanceService.getSlowQueries(10, 0);

      expect(Array.isArray(queries)).toBe(true);
      expect(queries.length).toBeLessThanOrEqual(10);
    });
  });

  describe("createSlowQueryAlert", () => {
    it("should create a slow query alert", async () => {
      const alert = await queryPerformanceService.createSlowQueryAlert(
        "alert_query_hash",
        "threshold_breach",
        "high",
        1000,
        1500,
        "Query exceeded threshold"
      );

      expect(alert).toBeDefined();
      expect(alert.queryHash).toBe("alert_query_hash");
      expect(alert.severity).toBe("high");
      expect(alert.alertType).toBe("threshold_breach");
    });
  });

  describe("getActiveAlerts", () => {
    it("should fetch active alerts", async () => {
      const alerts = await queryPerformanceService.getActiveAlerts(10, 0);

      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts.every((a) => !a.resolved)).toBe(true);
    });
  });

  describe("resolveAlert", () => {
    it("should resolve an alert", async () => {
      const alert = await queryPerformanceService.createSlowQueryAlert(
        "test_query",
        "performance_degradation",
        "medium",
        800,
        1200,
        "Performance issue"
      );

      await queryPerformanceService.resolveAlert(alert.id);

      expect(alert.id).toBeDefined();
    });
  });
});
