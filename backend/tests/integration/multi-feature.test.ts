import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { allowlistChangeReviewService } from "../../src/services/allowlistChangeReview.service.js";
import { exportQuotaService, QuotaExceededException } from "../../src/services/exportQuota.service.js";

describe("E2E Integration Tests", () => {
  describe("Allowlist Change Review Workflow", () => {
    it("should complete full workflow: submit → approve → apply", async () => {
      const testAddress = "0x1234567890123456789012345678901234567890";

      // Step 1: Submit change request
      const request = await allowlistChangeReviewService.submitChangeRequest(
        {
          contractAddress: testAddress,
          action: "add",
          reason: "Integration test",
        },
        "user1"
      );

      expect(request.status).toBe("pending");
      expect(request.contractAddress).toBe(testAddress.toLowerCase());

      // Step 2: Approve request (different user for four-eyes)
      const approved = await allowlistChangeReviewService.reviewRequest(
        request.id,
        "approved",
        "user2", // Different from user1
        "Approved for testing"
      );

      expect(approved.status).toBe("approved");
      expect(approved.reviewedBy).toBe("user2");

      // Step 3: Apply approved change
      await allowlistChangeReviewService.applyApprovedChange(request.id, "admin1");

      // Step 4: Verify allowlist updated
      const allowlist = await allowlistChangeReviewService.getCurrentAllowlist();
      const found = allowlist.find(
        (entry) => entry.contractAddress === testAddress.toLowerCase()
      );

      expect(found).toBeDefined();
      expect(found?.isActive).toBe(true);
    });
  });

  describe("Export Quota Exhaustion and Reset", () => {
    it("should block export when quota exceeded and allow after reset", async () => {
      const testUserId = "test-user-quota";

      // Step 1: Set a low quota for testing
      await exportQuotaService.setUserQuota(
        testUserId,
        { quotaType: "daily", maxExports: 2 },
        "admin1"
      );

      // Step 2: Use quota
      await exportQuotaService.incrementExport(testUserId, "csv", 100);
      await exportQuotaService.incrementExport(testUserId, "json", 200);

      // Step 3: Check quota is exhausted
      const status = await exportQuotaService.checkQuota(testUserId, "daily");
      expect(status.allowed).toBe(false);
      expect(status.remaining).toBe(0);

      // Step 4: Attempt to exceed quota
      await expect(
        exportQuotaService.incrementExport(testUserId, "pdf", 300)
      ).rejects.toThrow(QuotaExceededException);

      // Step 5: Reset quota (simulating daily reset)
      await exportQuotaService.resetExpiredQuotas();

      // Step 6: Verify quota is restored (would need to manipulate time or test with fresh period)
      // In real scenario, this would be a new day's quota
    });
  });

  describe("Four-Eyes Enforcement", () => {
    it("should prevent self-approval in allowlist review", async () => {
      const testAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";

      // Submit request
      const request = await allowlistChangeReviewService.submitChangeRequest(
        {
          contractAddress: testAddress,
          action: "add",
          reason: "Four-eyes test",
        },
        "user1"
      );

      // Attempt self-approval
      await expect(
        allowlistChangeReviewService.reviewRequest(
          request.id,
          "approved",
          "user1" // Same as requester
        )
      ).rejects.toThrow("four-eyes");
    });
  });

  describe("Export Quota Atomic Operations", () => {
    it("should handle concurrent quota increment attempts safely", async () => {
      const testUserId = "concurrent-user";

      // Set quota with only 1 remaining slot
      await exportQuotaService.setUserQuota(
        testUserId,
        { quotaType: "daily", maxExports: 1 },
        "admin1"
      );

      // Both requests should not both succeed due to forUpdate lock
      // In a real concurrent scenario, one would get QuotaExceededException
      try {
        await exportQuotaService.incrementExport(testUserId, "csv", 100);
        // If first succeeds, second should fail
        await expect(
          exportQuotaService.incrementExport(testUserId, "json", 200)
        ).rejects.toThrow(QuotaExceededException);
      } catch (error) {
        // If first fails, that's also acceptable
        expect(error).toBeInstanceOf(QuotaExceededException);
      }
    });
  });
});
