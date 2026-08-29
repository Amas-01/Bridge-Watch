import { describe, it, expect } from "vitest";
import { rollbackReadinessService } from "../../src/services/rollbackReadiness.service.js";

describe("Rollback Readiness Service", () => {
  describe("createCheck", () => {
    it("should create a readiness check", async () => {
      const check = await rollbackReadinessService.createCheck("deploy-123", "data-consistency", {
        tolerance: 0.001,
      });

      expect(check).toBeDefined();
      expect(check.deployment_id).toBe("deploy-123");
      expect(check.check_type).toBe("data-consistency");
      expect(check.status).toBe("pending");
    });
  });

  describe("executeCheck", () => {
    it("should execute a check and mark it as completed", async () => {
      const check = await rollbackReadinessService.createCheck("deploy-456", "pending-transactions", {
        maxAge: 60,
      });

      const result = await rollbackReadinessService.executeCheck(check.id, { count: 0 }, true);

      expect(result.status).toBe("completed");
      expect(result.passed).toBe(true);
    });

    it("should mark a failed check", async () => {
      const check = await rollbackReadinessService.createCheck("deploy-789", "backup-verification", {});

      const result = await rollbackReadinessService.executeCheck(
        check.id,
        { backupValid: false },
        false,
        "Backup not found"
      );

      expect(result.passed).toBe(false);
      expect(result.failure_reason).toBe("Backup not found");
    });
  });

  describe("getSummary", () => {
    it("should return a summary with ready status when all checks pass", async () => {
      const check1 = await rollbackReadinessService.createCheck("deploy-sum-1", "health-check", {});
      await rollbackReadinessService.executeCheck(check1.id, { healthy: true }, true);

      const summary = await rollbackReadinessService.getSummary("deploy-sum-1");

      expect(summary).toBeDefined();
      expect(summary?.overall_status).toBe("ready");
      expect(summary?.ready_for_rollback).toBe(true);
    });

    it("should return blocked status when any check fails", async () => {
      const check = await rollbackReadinessService.createCheck("deploy-block", "state-check", {});
      await rollbackReadinessService.executeCheck(check.id, { valid: false }, false);

      const summary = await rollbackReadinessService.getSummary("deploy-block");

      expect(summary?.overall_status).toBe("blocked");
      expect(summary?.ready_for_rollback).toBe(false);
    });
  });

  describe("initiateRollback", () => {
    it("should not allow rollback if deployment is not ready", async () => {
      const check = await rollbackReadinessService.createCheck("deploy-fail", "test-check", {});
      await rollbackReadinessService.executeCheck(check.id, {}, false);

      expect(async () => {
        await rollbackReadinessService.initiateRollback("deploy-fail", "admin", "Testing");
      }).rejects.toThrow();
    });
  });
});
