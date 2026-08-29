import { describe, it, expect } from "vitest";
import { canaryMetricService } from "../../src/services/canaryMetric.service.js";

describe("Canary Metric Service", () => {
  describe("createDeployment", () => {
    it("should create a canary deployment", async () => {
      const deployment = await canaryMetricService.createDeployment(
        "api-v2",
        "2.0.0",
        "production",
        { replicas: 2 },
        10,
        "1.9.9"
      );

      expect(deployment).toBeDefined();
      expect(deployment.deployment_name).toBe("api-v2");
      expect(deployment.version).toBe("2.0.0");
      expect(deployment.status).toBe("running");
      expect(deployment.traffic_percentage).toBe(10);
    });
  });

  describe("recordMetric", () => {
    it("should record a metric within threshold", async () => {
      const deployment = await canaryMetricService.createDeployment(
        "service-v1",
        "1.0.0",
        "staging",
        {}
      );

      const metric = await canaryMetricService.recordMetric(
        deployment.id,
        "latency_p99",
        "latency",
        105,
        100,
        10
      );

      expect(metric.within_threshold).toBe(true);
      expect(metric.deviation_pct).toBeLessThanOrEqual(10);
    });

    it("should record a metric exceeding threshold", async () => {
      const deployment = await canaryMetricService.createDeployment(
        "service-v2",
        "2.0.0",
        "staging",
        {}
      );

      const metric = await canaryMetricService.recordMetric(
        deployment.id,
        "error_rate",
        "error",
        5.5,
        1.0,
        3
      );

      expect(metric.within_threshold).toBe(false);
      expect(metric.deviation_pct).toBeGreaterThan(3);
    });
  });

  describe("getComparison", () => {
    it("should return comparison with expand_traffic recommendation if all metrics healthy", async () => {
      const deployment = await canaryMetricService.createDeployment("app-v1", "1.0.0", "prod", {});

      await canaryMetricService.recordMetric(deployment.id, "throughput", "throughput", 1000, 1000, 5);
      await canaryMetricService.recordMetric(deployment.id, "memory", "memory", 512, 500, 5);

      const comparison = await canaryMetricService.getComparison(deployment.id);

      expect(comparison).toBeDefined();
      expect(comparison?.recommendation).toBe("expand_traffic");
      expect(comparison?.healthy_metrics).toBe(2);
    });

    it("should return rollback recommendation if most metrics are unhealthy", async () => {
      const deployment = await canaryMetricService.createDeployment("app-v2", "2.0.0", "prod", {});

      await canaryMetricService.recordMetric(deployment.id, "latency", "latency", 500, 100, 10);
      await canaryMetricService.recordMetric(deployment.id, "cpu", "cpu", 95, 20, 10);

      const comparison = await canaryMetricService.getComparison(deployment.id);

      expect(comparison?.recommendation).toBe("rollback");
    });
  });

  describe("completeDeployment", () => {
    it("should mark deployment as completed", async () => {
      const deployment = await canaryMetricService.createDeployment("svc-v1", "1.0.0", "prod", {});

      const completed = await canaryMetricService.completeDeployment(deployment.id, "completed");

      expect(completed.status).toBe("completed");
      expect(completed.ended_at).toBeDefined();
    });
  });

  describe("listDeployments", () => {
    it("should list deployments filtered by environment", async () => {
      await canaryMetricService.createDeployment("api-1", "1.0.0", "staging", {});
      await canaryMetricService.createDeployment("api-2", "2.0.0", "production", {});

      const stagingDeployments = await canaryMetricService.listDeployments("staging");

      expect(stagingDeployments.length).toBeGreaterThan(0);
      expect(stagingDeployments.every((d) => d.environment === "staging")).toBe(true);
    });
  });
});
