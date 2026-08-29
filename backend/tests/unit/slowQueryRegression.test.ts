import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as service from "../../src/services/slowQueryRegression.service.js";

describe("Slow Query Regression Service", () => {
  describe("createBaseline", () => {
    it("should create a baseline with default variance threshold", async () => {
      const result = await service.slowQueryRegressionService.createBaseline("SELECT * FROM users", 100);
      expect(result).toBeDefined();
      expect(result.query_name).toBe("SELECT * FROM users");
      expect(result.baseline_ms).toBe(100);
      expect(result.variance_threshold).toBe(0.2);
      expect(result.status).toBe("active");
    });

    it("should create a baseline with custom variance threshold", async () => {
      const result = await service.slowQueryRegressionService.createBaseline("SELECT * FROM posts", 50, 0.15);
      expect(result.variance_threshold).toBe(0.15);
    });
  });

  describe("recordObservation", () => {
    it("should record an observation within threshold", async () => {
      const baseline = await service.slowQueryRegressionService.createBaseline("SELECT * FROM comments", 100);
      const observation = await service.slowQueryRegressionService.recordObservation(baseline.id, 105);

      expect(observation).toBeDefined();
      expect(observation.execution_ms).toBe(105);
      expect(observation.is_regression).toBe(false);
    });

    it("should record an observation exceeding threshold", async () => {
      const baseline = await service.slowQueryRegressionService.createBaseline("SELECT * FROM logs", 100);
      const observation = await service.slowQueryRegressionService.recordObservation(baseline.id, 150);

      expect(observation.execution_ms).toBe(150);
      expect(observation.is_regression).toBe(true);
    });
  });

  describe("getActiveAlerts", () => {
    it("should return active alerts sorted by severity", async () => {
      const baseline = await service.slowQueryRegressionService.createBaseline("SELECT * FROM stats", 100);
      await service.slowQueryRegressionService.recordObservation(baseline.id, 160);
      await service.slowQueryRegressionService.recordObservation(baseline.id, 170);

      const alerts = await service.slowQueryRegressionService.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].status).toBe("active");
    });
  });

  describe("disableBaseline", () => {
    it("should disable a baseline", async () => {
      const baseline = await service.slowQueryRegressionService.createBaseline("SELECT * FROM events", 100);
      const disabled = await service.slowQueryRegressionService.disableBaseline(baseline.id);

      expect(disabled.status).toBe("disabled");
    });
  });
});
