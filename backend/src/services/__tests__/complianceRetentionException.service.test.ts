import { describe, it, expect, beforeEach, vi } from "vitest";
import { ComplianceRetentionExceptionService } from "../complianceRetentionException.service.js";

vi.mock("../../database/connection.js", () => {
  const mockExceptions: any[] = [];
  const mockDb: any = vi.fn().mockImplementation(() => {
    const builder: any = {
      insert: vi.fn().mockImplementation((data) => {
        const record = { id: "exc-uuid-1", ...data, created_at: new Date(), updated_at: new Date() };
        mockExceptions.push(record);
        return Promise.resolve([record]);
      }),
      select: vi.fn().mockImplementation(() => builder),
      where: vi.fn().mockImplementation(() => builder),
      whereNull: vi.fn().mockImplementation(() => builder),
      whereIn: vi.fn().mockImplementation(() => builder),
      orWhere: vi.fn().mockImplementation(() => builder),
      orderBy: vi.fn().mockImplementation(() => Promise.resolve(mockExceptions)),
      first: vi.fn().mockImplementation(() => Promise.resolve(mockExceptions[0] ?? null)),
      then: vi.fn().mockImplementation((resolve) => resolve(mockExceptions)),
      update: vi.fn().mockImplementation((data) => {
        if (mockExceptions[0]) Object.assign(mockExceptions[0], data);
        return Promise.resolve(1);
      }),
    };
    return builder;
  });

  return { getDatabase: () => mockDb };
});

describe("ComplianceRetentionExceptionService", () => {
  let service: ComplianceRetentionExceptionService;

  beforeEach(() => {
    service = new ComplianceRetentionExceptionService();
    vi.clearAllMocks();
  });

  it("creates a new active compliance retention exception", async () => {
    const record = await service.createException({
      exceptionCode: "HOLD-2026-001",
      title: "Regulatory Hold for SEC Audit",
      reason: "Legal counsel requested hold on all USDC mismatch logs",
      requestedBy: "legal_officer",
      targetType: "mismatch",
    });

    expect(record.id).toBe("exc-uuid-1");
    expect(record.exception_code).toBe("HOLD-2026-001");
    expect(record.status).toBe("active");
  });

  it("lists compliance retention exceptions", async () => {
    const list = await service.listExceptions({ status: "active" });
    expect(Array.isArray(list)).toBe(true);
  });

  it("releases active retention exception", async () => {
    await service.createException({
      exceptionCode: "HOLD-2026-002",
      title: "Temporary Audit Hold",
      reason: "Internal compliance review",
      requestedBy: "compliance_auditor",
      targetType: "report",
    });

    const released = await service.releaseException("exc-uuid-1", "compliance_lead", "Audit completed");
    expect(released.status).toBe("released");
    expect(released.released_by).toBe("compliance_lead");
  });

  it("checks if a record target is protected from cleanup", async () => {
    const isProtected = await service.isProtectedFromCleanup("mismatch", "mismatch-123");
    expect(typeof isProtected).toBe("boolean");
  });
});
