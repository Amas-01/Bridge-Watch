import { describe, it, expect, beforeEach, vi } from "vitest";
import { deploymentDriftService } from "../deploymentDrift.service.js";

describe("deploymentDriftService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createEnvironmentSnapshot", () => {
    it("should create an environment snapshot", async () => {
      const snapshot = await deploymentDriftService.createEnvironmentSnapshot(
        "prod",
        "production",
        "1.2.3",
        { replicas: 3, cpu: "4", memory: "8Gi" },
        "deploy-user",
        new Date()
      );

      expect(snapshot).toBeDefined();
      expect(snapshot.environmentName).toBe("prod");
      expect(snapshot.environmentType).toBe("production");
      expect(snapshot.snapshotVersion).toBe("1.2.3");
    });

    it("should create snapshots for different environment types", async () => {
      const types: Array<"production" | "staging" | "development" | "testing"> = [
        "production",
        "staging",
        "development",
        "testing",
      ];

      for (const type of types) {
        const snapshot = await deploymentDriftService.createEnvironmentSnapshot(
          `env-${type}`,
          type,
          "1.0.0",
          { env: type },
          "user",
          new Date()
        );

        expect(snapshot.environmentType).toBe(type);
      }
    });
  });

  describe("detectDrift", () => {
    it("should detect configuration drift between environments", async () => {
      await deploymentDriftService.createEnvironmentSnapshot(
        "staging",
        "staging",
        "1.0.0",
        { cpu: "2", memory: "4Gi" },
        "user1",
        new Date()
      );

      await deploymentDriftService.createEnvironmentSnapshot(
        "prod",
        "production",
        "1.0.0",
        { cpu: "4", memory: "8Gi" },
        "user2",
        new Date()
      );

      const drift = await deploymentDriftService.detectDrift("staging", "prod");

      expect(drift).toBeDefined();
      expect(drift.driftType).toBe("config_drift");
      expect(drift.driftScore).toBeGreaterThan(0);
      expect(drift.changedFields.length).toBeGreaterThan(0);
    });
  });

  describe("approveDrift", () => {
    it("should approve a drift record", async () => {
      await deploymentDriftService.createEnvironmentSnapshot(
        "stage",
        "staging",
        "1.0.0",
        { version: "1.0" },
        "user",
        new Date()
      );

      await deploymentDriftService.createEnvironmentSnapshot(
        "prod",
        "production",
        "1.0.0",
        { version: "1.1" },
        "user",
        new Date()
      );

      const drift = await deploymentDriftService.detectDrift("stage", "prod");
      await deploymentDriftService.approveDrift(drift.id, "approver");

      expect(drift.id).toBeDefined();
    });
  });

  describe("getDriftsByEnvironment", () => {
    it("should fetch drifts for a specific environment", async () => {
      const drifts = await deploymentDriftService.getDriftsByEnvironment("prod", 10, 0);

      expect(Array.isArray(drifts)).toBe(true);
      expect(drifts.length).toBeLessThanOrEqual(10);
    });
  });

  describe("getUnapprovedDrifts", () => {
    it("should fetch only unapproved drifts", async () => {
      const drifts = await deploymentDriftService.getUnapprovedDrifts(10, 0);

      expect(Array.isArray(drifts)).toBe(true);
      expect(drifts.every((d) => !d.isApproved)).toBe(true);
    });
  });

  describe("createDriftAlert", () => {
    it("should create a drift alert", async () => {
      await deploymentDriftService.createEnvironmentSnapshot(
        "env1",
        "staging",
        "1.0.0",
        {},
        "user",
        new Date()
      );

      await deploymentDriftService.createEnvironmentSnapshot(
        "env2",
        "production",
        "1.0.0",
        { change: "value" },
        "user",
        new Date()
      );

      const drift = await deploymentDriftService.detectDrift("env1", "env2");
      const alert = await deploymentDriftService.createDriftAlert(
        drift.id,
        "configuration_mismatch",
        "Configuration mismatch detected",
        ["Update environment variables", "Redeploy service"]
      );

      expect(alert).toBeDefined();
      expect(alert.driftRecordId).toBe(drift.id);
      expect(alert.status).toBe("open");
    });
  });
});
