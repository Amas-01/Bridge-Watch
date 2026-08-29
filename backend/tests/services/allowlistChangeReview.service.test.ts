import { describe, it, expect, vi, beforeEach } from "vitest";
import { allowlistChangeReviewService } from "../../src/services/allowlistChangeReview.service.js";

// Mock database
vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => ({
    transaction: vi.fn((cb) => cb(mockTrx)),
    // Will be populated per test
  })),
}));

// Mock audit service
vi.mock("../../src/services/audit.service.js", () => ({
  auditService: {
    log: vi.fn(),
  },
}));

const mockTrx = {
  where: vi.fn().mockReturnThis(),
  first: vi.fn(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  returning: vi.fn(),
};

describe("AllowlistChangeReviewService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("submitChangeRequest", () => {
    it("should create a change request with valid address", async () => {
      const mockInserted = {
        id: "test-id",
        contract_address: "0x1234567890123456789012345678901234567890",
        action: "add",
        reason: "test reason",
        requested_by: "user1",
        status: "pending",
        created_at: new Date(),
        updated_at: new Date(),
      };

      const { getDatabase } = await import("../../src/database/connection.js");
      (getDatabase as any).mockReturnValue({
        "allowlist_change_requests": {
          insert: vi.fn().mockReturnThis(),
          returning: vi.fn().mockResolvedValue([mockInserted]),
        },
      });

      const result = await allowlistChangeReviewService.submitChangeRequest(
        {
          contractAddress: "0x1234567890123456789012345678901234567890",
          action: "add",
          reason: "test reason",
        },
        "user1"
      );

      expect(result.contractAddress).toBe("0x1234567890123456789012345678901234567890");
    });

    it("should reject invalid Ethereum address", async () => {
      await expect(
        allowlistChangeReviewService.submitChangeRequest(
          {
            contractAddress: "invalid",
            action: "add",
            reason: "test",
          },
          "user1"
        )
      ).rejects.toThrow("Invalid Ethereum address format");
    });
  });

  describe("reviewRequest - Four-Eyes Check", () => {
    it("should allow review when reviewer !== requester", async () => {
      const mockRequest = {
        id: "req-1",
        requested_by: "user1",
        status: "pending",
      };

      const mockUpdated = {
        ...mockRequest,
        status: "approved",
        reviewed_by: "user2",
        reviewed_at: new Date(),
        updated_at: new Date(),
      };

      const { getDatabase } = await import("../../src/database/connection.js");
      const mockDb: any = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockRequest),
        update: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockUpdated]),
      };
      mockDb.mockReturnValue = vi.fn(() => mockDb);
      (getDatabase as any).mockReturnValue(() => mockDb);

      const result = await allowlistChangeReviewService.reviewRequest(
        "req-1",
        "approved",
        "user2"
      );

      expect(result.reviewedBy).toBe("user2");
      expect(result.status).toBe("approved");
    });

    it("should reject review when reviewer === requester (four-eyes violated)", async () => {
      const mockRequest = {
        id: "req-1",
        requested_by: "user1",
        status: "pending",
      };

      const { getDatabase } = await import("../../src/database/connection.js");
      const mockDb: any = {
        where: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(mockRequest),
      };
      mockDb.mockReturnValue = vi.fn(() => mockDb);
      (getDatabase as any).mockReturnValue(() => mockDb);

      await expect(
        allowlistChangeReviewService.reviewRequest("req-1", "approved", "user1")
      ).rejects.toThrow("four-eyes");
    });
  });

  describe("applyApprovedChange", () => {
    it("should add contract to allowlist on approved add request", async () => {
      const mockRequest = {
        id: "req-1",
        contract_address: "0x1234567890123456789012345678901234567890",
        action: "add",
        status: "approved",
      };

      mockTrx.first.mockResolvedValueOnce(mockRequest); // fetch request
      mockTrx.first.mockResolvedValueOnce(null); // check existing allowlist entry

      await allowlistChangeReviewService.applyApprovedChange("req-1", "admin1");

      expect(mockTrx.insert).toHaveBeenCalled();
    });

    it("should throw error if request is not approved", async () => {
      const mockRequest = {
        id: "req-1",
        status: "pending",
      };

      mockTrx.first.mockResolvedValue(mockRequest);

      await expect(
        allowlistChangeReviewService.applyApprovedChange("req-1", "admin1")
      ).rejects.toThrow("Only approved requests can be applied");
    });
  });
});
