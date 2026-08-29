import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { AddressLabelService } from "../../src/services/addressLabel.service.js";

vi.mock("../../src/database/connection.js", () => {
  const mockDbQuery: any = {
    select: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    whereIn: vi.fn().mockReturnThis(),
    whereILike: vi.fn().mockReturnThis(),
    orWhereILike: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    first: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    del: vi.fn().mockResolvedValue(0),
    returning: vi.fn().mockReturnThis(),
  };

  const mockDb: any = vi.fn().mockImplementation(() => mockDbQuery);

  return { getDatabase: () => mockDb };
});

vi.mock("../../src/services/audit.service.js", () => ({
  auditService: { log: vi.fn().mockResolvedValue({}) },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("AddressLabelService", () => {
  let service: AddressLabelService;
  let mockDb: any;
  let mockDbQuery: any;

  beforeEach(() => {
    service = new AddressLabelService();
    vi.clearAllMocks();

    mockDb = getDatabase();
    mockDbQuery = mockDb();

    mockDbQuery.first.mockResolvedValue(undefined);
    mockDbQuery.returning.mockResolvedValue([]);
    mockDbQuery.del.mockResolvedValue(0);
  });

  describe("createLabel", () => {
    it("creates a label for a valid address", async () => {
      const created = {
        id: "label-1",
        address: "GABCXYZ",
        chain: "stellar",
        label: "Known exchange hot wallet",
        category: "exchange",
      };
      mockDbQuery.first.mockResolvedValue(undefined);
      mockDbQuery.returning.mockResolvedValue([created]);

      const result = await service.createLabel({
        address: "GABCXYZ",
        label: "Known exchange hot wallet",
        category: "exchange",
        performedBy: "admin-1",
      });

      expect(result).toEqual(created);
    });

    it("rejects an empty address", async () => {
      await expect(
        service.createLabel({ address: "  ", label: "x", performedBy: "admin-1" })
      ).rejects.toThrow("Address is required");
    });

    it("rejects an unsupported chain", async () => {
      await expect(
        service.createLabel({ address: "0xabc", chain: "made-up-chain", label: "x", performedBy: "admin-1" })
      ).rejects.toThrow("Unsupported chain");
    });

    it("rejects an unsupported category", async () => {
      await expect(
        service.createLabel({ address: "0xabc", category: "made-up", label: "x", performedBy: "admin-1" })
      ).rejects.toThrow("Unsupported category");
    });

    it("rejects a confidence value out of range", async () => {
      await expect(
        service.createLabel({ address: "0xabc", label: "x", confidence: 150, performedBy: "admin-1" })
      ).rejects.toThrow("Confidence must be");
    });

    it("rejects a duplicate address+chain", async () => {
      mockDbQuery.first.mockResolvedValue({ id: "existing", address: "GABCXYZ", chain: "stellar" });

      await expect(
        service.createLabel({ address: "GABCXYZ", label: "dup", performedBy: "admin-1" })
      ).rejects.toThrow("already labeled");
    });
  });

  describe("updateLabel", () => {
    it("throws when the label does not exist", async () => {
      mockDbQuery.first.mockResolvedValue(undefined);
      await expect(
        service.updateLabel("missing-id", { label: "new" }, "admin-1")
      ).rejects.toThrow("not found");
    });

    it("rejects an invalid confidence on update", async () => {
      mockDbQuery.first.mockResolvedValue({ id: "1", label: "old" });
      await expect(
        service.updateLabel("1", { confidence: -5 }, "admin-1")
      ).rejects.toThrow("Confidence must be");
    });
  });

  describe("deleteLabel", () => {
    it("throws when the label does not exist", async () => {
      mockDbQuery.first.mockResolvedValue(undefined);
      await expect(service.deleteLabel("missing-id", "admin-1")).rejects.toThrow("not found");
    });

    it("deletes an existing label", async () => {
      mockDbQuery.first.mockResolvedValue({ id: "1", address: "GABCXYZ", chain: "stellar" });
      mockDbQuery.del.mockResolvedValue(1);

      await expect(service.deleteLabel("1", "admin-1")).resolves.toBe(true);
    });
  });

  describe("lookupAddresses", () => {
    it("de-duplicates addresses and maps results by address", async () => {
      mockDbQuery.whereIn.mockReturnThis();
      mockDbQuery.andWhere.mockReturnThis();
      // findByAddresses resolves the query builder itself as a thenable-less mock,
      // so make it directly return the row array via mockResolvedValue on the
      // final chain call ("andWhere" here since no explicit `.then`).
      const rows = [{ id: "1", address: "GABCXYZ", chain: "stellar" }];
      mockDb.mockImplementation(() => ({
        ...mockDbQuery,
        whereIn: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockResolvedValue(rows),
      }));

      const result = await service.lookupAddresses(["GABCXYZ", "GABCXYZ", ""]);
      expect(result.get("GABCXYZ")).toEqual(rows[0]);
    });
  });
});
