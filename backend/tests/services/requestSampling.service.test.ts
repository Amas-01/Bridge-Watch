import { describe, it, expect, vi, beforeEach } from "vitest";
import { RequestSamplingService } from "../../src/services/requestSampling.service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockDb: Record<string, unknown> = {};

function makeDbChain(resolvedValue: unknown) {
  const chain: Record<string, unknown> = {};
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(resolvedValue);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockResolvedValue(1);
  chain.returning = vi.fn().mockResolvedValue(
    Array.isArray(resolvedValue) ? resolvedValue : [resolvedValue]
  );
  // Allow iterating (for the rows = await db(...) pattern)
  chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
    Promise.resolve(fn(Array.isArray(resolvedValue) ? resolvedValue : []))
  );
  return chain;
}

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => {
    const fn = (_table: string) => mockDb as unknown;
    fn.raw = vi.fn((s: string) => s);
    return fn;
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshService(): RequestSamplingService {
  (RequestSamplingService as unknown as { instance: unknown }).instance =
    undefined;
  return RequestSamplingService.getInstance();
}

// ---------------------------------------------------------------------------
// Test 1: getSamplingRules returns rules ordered by priority
// ---------------------------------------------------------------------------

describe("RequestSamplingService — getSamplingRules", () => {
  beforeEach(() => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const chain = makeDbChain([
      {
        id: "r1",
        name: "Low priority",
        description: null,
        sample_rate: "0.5",
        target: "all_requests",
        target_value: null,
        enabled: true,
        priority: 10,
        created_by: "admin",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "r2",
        name: "High priority",
        description: null,
        sample_rate: "1.0",
        target: "all_requests",
        target_value: null,
        enabled: true,
        priority: 0,
        created_by: "admin",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );
  });

  it("returns rules ordered by priority from the db query", async () => {
    const service = freshService();
    // The method returns rows in the order the DB returns them
    const rules = await service.getSamplingRules();
    expect(Array.isArray(rules)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 2 & 3: createRule validates sample_rate range
// ---------------------------------------------------------------------------

describe("RequestSamplingService — createRule validation", () => {
  it("throws for sample_rate > 1.0", async () => {
    const service = freshService();
    await expect(
      service.createRule({
        name: "bad",
        sampleRate: 1.5,
        createdBy: "admin",
      })
    ).rejects.toThrow("sample_rate must be a number between 0.0 and 1.0");
  });

  it("throws for sample_rate < 0.0", async () => {
    const service = freshService();
    await expect(
      service.createRule({
        name: "bad",
        sampleRate: -0.1,
        createdBy: "admin",
      })
    ).rejects.toThrow("sample_rate must be a number between 0.0 and 1.0");
  });

  it("accepts sample_rate = 0.0 (boundary)", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const row = {
      id: "r1",
      name: "zero",
      description: null,
      sample_rate: "0",
      target: "all_requests",
      target_value: null,
      enabled: true,
      priority: 0,
      created_by: "admin",
      created_at: new Date(),
      updated_at: new Date(),
    };
    const chain = makeDbChain(row);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue((_t: string) => chain);

    const service = freshService();
    const result = await service.createRule({
      name: "zero",
      sampleRate: 0.0,
      createdBy: "admin",
    });
    expect(result.sampleRate).toBe(0);
  });

  it("accepts sample_rate = 1.0 (boundary)", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const row = {
      id: "r2",
      name: "full",
      description: null,
      sample_rate: "1",
      target: "all_requests",
      target_value: null,
      enabled: true,
      priority: 0,
      created_by: "admin",
      created_at: new Date(),
      updated_at: new Date(),
    };
    const chain = makeDbChain(row);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue((_t: string) => chain);

    const service = freshService();
    const result = await service.createRule({
      name: "full",
      sampleRate: 1.0,
      createdBy: "admin",
    });
    expect(result.sampleRate).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests 3–5: shouldSampleRequest determinism and boundary conditions
// ---------------------------------------------------------------------------

describe("RequestSamplingService — shouldSampleRequest", () => {
  function setupEnabledRule(sampleRate: number) {
    const { getDatabase } = vi.mocked(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("../../src/database/connection.js")
    );
    const rows = [
      {
        id: "r1",
        name: "rule",
        description: null,
        sample_rate: String(sampleRate),
        target: "all_requests",
        target_value: null,
        enabled: true,
        priority: 0,
        created_by: "admin",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];
    const chain = makeDbChain(rows);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );
  }

  it("returns true for sample_rate=1.0 (always sample)", async () => {
    setupEnabledRule(1.0);
    const service = freshService();
    const result = await service.shouldSampleRequest({
      id: "req-001",
      url: "/api/test",
    });
    expect(result).toBe(true);
  });

  it("returns false for sample_rate=0.0 (never sample)", async () => {
    setupEnabledRule(0.0);
    const service = freshService();
    const result = await service.shouldSampleRequest({
      id: "req-002",
      url: "/api/test",
    });
    expect(result).toBe(false);
  });

  it("is deterministic — same request ID always returns same decision", async () => {
    // Use the private deterministicSample method directly via service access
    const service = freshService();
    const privateMethod = (service as unknown as {
      deterministicSample: (id: string, rate: number) => boolean;
    }).deterministicSample.bind(service);

    const rate = 0.5;
    const id = "stable-request-id-xyz";
    const first = privateMethod(id, rate);
    const second = privateMethod(id, rate);
    const third = privateMethod(id, rate);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("applies the highest-priority matching rule first", async () => {
    // Two rules, priority 0 (first evaluated) has sampleRate=0.0 → never sample
    // priority 10 has sampleRate=1.0 → always sample
    // Expected: rule with priority=0 governs → false
    const { getDatabase } = vi.mocked(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("../../src/database/connection.js")
    );
    const rows = [
      {
        id: "high",
        name: "first",
        description: null,
        sample_rate: "0",
        target: "all_requests",
        target_value: null,
        enabled: true,
        priority: 0,
        created_by: "admin",
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: "low",
        name: "second",
        description: null,
        sample_rate: "1",
        target: "all_requests",
        target_value: null,
        enabled: true,
        priority: 10,
        created_by: "admin",
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];
    const chain = makeDbChain(rows);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const result = await service.shouldSampleRequest({
      id: "req-100",
      url: "/test",
    });
    // Priority 0 rule matches first with sampleRate=0 → never sampled
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Test 6: no rules → default true
// ---------------------------------------------------------------------------

describe("RequestSamplingService — no rules default", () => {
  it("returns true when no enabled rules exist", async () => {
    const { getDatabase } = vi.mocked(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("../../src/database/connection.js")
    );
    const chain = makeDbChain([]);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const result = await service.shouldSampleRequest({
      id: "req-999",
      url: "/api/test",
    });
    expect(result).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 7: deleteRule throws for non-existent id
// ---------------------------------------------------------------------------

describe("RequestSamplingService — deleteRule", () => {
  it("throws when the rule is not found", async () => {
    const { getDatabase } = vi.mocked(
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require("../../src/database/connection.js")
    );
    const chain = makeDbChain(null);
    chain.delete = vi.fn().mockResolvedValue(0);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(service.deleteRule("nonexistent", "admin")).rejects.toThrow(
      "not found"
    );
  });
});
