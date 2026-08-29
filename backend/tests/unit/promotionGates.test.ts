import { describe, it, expect } from "vitest";
import { promotionGatesService } from "../../src/services/promotionGates.service.js";

describe("Promotion Gates Service", () => {
  describe("createGate", () => {
    it("should create a promotion gate", async () => {
      const gate = await promotionGatesService.createGate(
        "staging",
        "production",
        "security-scan",
        "automated-check",
        { cveThreshold: 0 },
        1,
        "security,devops"
      );

      expect(gate).toBeDefined();
      expect(gate.source_environment).toBe("staging");
      expect(gate.target_environment).toBe("production");
      expect(gate.gate_name).toBe("security-scan");
      expect(gate.status).toBe("active");
    });
  });

  describe("requestPromotion", () => {
    it("should create a promotion request", async () => {
      await promotionGatesService.createGate("dev", "staging", "test-gate", "automated", {});

      const promotion = await promotionGatesService.requestPromotion("app-deploy-1", "1.0.0", "dev", "staging");

      expect(promotion).toBeDefined();
      expect(promotion.deployment_id).toBe("app-deploy-1");
      expect(promotion.status).toBe("pending");
      expect(promotion.total_gates).toBeGreaterThan(0);
    });
  });

  describe("executeGate", () => {
    it("should execute a gate and update promotion status", async () => {
      const gate = await promotionGatesService.createGate("staging", "prod", "health-check", "check", {}, 1);
      const promotion = await promotionGatesService.requestPromotion("deploy-exec", "1.0.0", "staging", "prod");

      const log = await promotionGatesService.executeGate(gate.id, promotion.id, true, { healthy: true });

      expect(log).toBeDefined();
      expect(log.passed).toBe(true);
      expect(log.execution_status).toBe("completed");
    });
  });

  describe("approvePromotion", () => {
    it("should approve a promotion", async () => {
      const gate = await promotionGatesService.createGate("dev", "prod", "manual-approval", "manual", {}, 1);
      const promotion = await promotionGatesService.requestPromotion("deploy-approve", "1.0.0", "dev", "prod");

      const approval = await promotionGatesService.approvePromotion(promotion.id, "user123", "Looks good");

      expect(approval).toBeDefined();
      expect(approval.decision).toBe("approved");
      expect(approval.approver_id).toBe("user123");
    });
  });

  describe("denyPromotion", () => {
    it("should deny a promotion", async () => {
      const gate = await promotionGatesService.createGate("staging", "prod", "review-gate", "manual", {}, 1);
      const promotion = await promotionGatesService.requestPromotion("deploy-deny", "1.0.0", "staging", "prod");

      const denial = await promotionGatesService.denyPromotion(
        promotion.id,
        "reviewer456",
        "Needs more testing"
      );

      expect(denial.decision).toBe("denied");
      expect(denial.comment).toBe("Needs more testing");
    });
  });

  describe("promoteDeployment", () => {
    it("should promote an approved deployment", async () => {
      const gate = await promotionGatesService.createGate("env1", "env2", "go-gate", "check", {}, 1);
      const promotion = await promotionGatesService.requestPromotion("deploy-promote", "1.0.0", "env1", "env2");

      await promotionGatesService.approvePromotion(promotion.id, "admin");
      const promoted = await promotionGatesService.promoteDeployment(promotion.id);

      expect(promoted.status).toBe("promoted");
      expect(promoted.promoted_at).toBeDefined();
    });
  });

  describe("listPromotions", () => {
    it("should list promotions filtered by environment", async () => {
      await promotionGatesService.createGate("staging", "prod", "gate1", "check", {}, 1);
      await promotionGatesService.requestPromotion("deploy1", "1.0.0", "staging", "prod");
      await promotionGatesService.requestPromotion("deploy2", "2.0.0", "staging", "prod");

      const promotions = await promotionGatesService.listPromotions("staging", "prod");

      expect(promotions.length).toBeGreaterThanOrEqual(2);
      expect(promotions.every((p) => p.source_environment === "staging")).toBe(true);
    });
  });
});
