import { describe, it, expect, beforeEach, vi } from "vitest";
import { OperatorAvailabilityService, rangesOverlap } from "../../src/services/operatorAvailability.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/database/connection.js", () => {
  const mockRecords: any[] = [];
  let nextId = 1;
  const mockDb: any = vi.fn().mockImplementation(() => {
    const builder: any = {
      insert: vi.fn().mockImplementation((data) => {
        const record = { id: `availability-${nextId++}`, ...data, created_at: new Date(), updated_at: new Date() };
        mockRecords.push(record);
        return {
          returning: vi.fn().mockResolvedValue([record]),
        };
      }),
      where: vi.fn().mockImplementation((clause: any) => {
        builder.__filters = { ...(builder.__filters ?? {}), ...clause };
        return builder;
      }),
      orderBy: vi.fn().mockImplementation(() => builder),
      first: vi.fn().mockImplementation(() => {
        const id = builder.__filters?.id;
        return Promise.resolve(mockRecords.find((r) => r.id === id) ?? undefined);
      }),
      update: vi.fn().mockImplementation((data) => {
        const id = builder.__filters?.id;
        const record = mockRecords.find((r) => r.id === id);
        if (record) Object.assign(record, data);
        return Promise.resolve(1);
      }),
      delete: vi.fn().mockImplementation(() => {
        const id = builder.__filters?.id;
        const idx = mockRecords.findIndex((r) => r.id === id);
        if (idx >= 0) mockRecords.splice(idx, 1);
        return Promise.resolve(1);
      }),
      then: (resolve: any) => Promise.resolve(mockRecords).then(resolve),
    };
    return builder;
  });

  return { getDatabase: () => mockDb };
});

describe("rangesOverlap", () => {
  it("detects overlapping ranges", () => {
    const a = new Date("2026-09-01T00:00:00Z");
    const b = new Date("2026-09-02T00:00:00Z");
    const c = new Date("2026-09-01T12:00:00Z");
    const d = new Date("2026-09-03T00:00:00Z");
    expect(rangesOverlap(a, b, c, d)).toBe(true);
  });

  it("detects non-overlapping ranges", () => {
    const a = new Date("2026-09-01T00:00:00Z");
    const b = new Date("2026-09-02T00:00:00Z");
    const c = new Date("2026-09-03T00:00:00Z");
    const d = new Date("2026-09-04T00:00:00Z");
    expect(rangesOverlap(a, b, c, d)).toBe(false);
  });
});

describe("OperatorAvailabilityService", () => {
  let service: OperatorAvailabilityService;

  beforeEach(() => {
    service = new OperatorAvailabilityService();
    vi.clearAllMocks();
  });

  it("creates an availability entry", async () => {
    const entry = await service.createAvailability({
      operator: "op_alice",
      status: "on_call",
      startTime: new Date("2026-09-01T00:00:00Z"),
      endTime: new Date("2026-09-02T00:00:00Z"),
      createdBy: "op_alice",
    });

    expect(entry.operator).toBe("op_alice");
    expect(entry.status).toBe("on_call");
  });

  it("rejects an availability entry where endTime is not after startTime", async () => {
    await expect(
      service.createAvailability({
        operator: "op_alice",
        status: "available",
        startTime: new Date("2026-09-02T00:00:00Z"),
        endTime: new Date("2026-09-01T00:00:00Z"),
        createdBy: "op_alice",
      })
    ).rejects.toThrow("endTime must be after startTime");
  });

  it("updates an existing availability entry", async () => {
    const entry = await service.createAvailability({
      operator: "op_bob",
      status: "available",
      startTime: new Date("2026-09-01T00:00:00Z"),
      endTime: new Date("2026-09-02T00:00:00Z"),
      createdBy: "op_bob",
    });

    const updated = await service.updateAvailability(entry.id, { status: "unavailable" });
    expect(updated?.status).toBe("unavailable");
  });

  it("throws when updating a non-existent entry", async () => {
    await expect(
      service.updateAvailability("missing-id", { status: "available" })
    ).rejects.toThrow("Availability entry not found");
  });
});
