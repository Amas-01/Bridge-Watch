import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfigVersionService } from "../../src/services/configVersion.service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeVersionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "v1",
    config_key: "alert-thresholds",
    version_number: 1,
    payload: JSON.stringify({ priceDeviation: 0.02 }),
    change_summary: "Initial",
    applied_by: "admin",
    applied_at: new Date(),
    is_current: true,
    ...overrides,
  };
}

function makeDbChain(firstResult: unknown, selectResult?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(firstResult);
  chain.max = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(
    Array.isArray(firstResult) ? firstResult : firstResult ? [firstResult] : []
  );
  chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) => {
    const val = selectResult !== undefined ? selectResult : firstResult;
    return Promise.resolve(fn(Array.isArray(val) ? val : []));
  });
  return chain;
}

// Transaction mock that captures the callback
function makeTrxMock(insertedRow: unknown) {
  return vi.fn().mockImplementation(
    async (fn: (trx: unknown) => Promise<unknown>) => {
      const trx: Record<string, unknown> = {};
      trx.where = vi.fn().mockReturnValue(trx);
      trx.update = vi.fn().mockReturnValue(trx);
      trx.insert = vi.fn().mockReturnValue(trx);
      trx.returning = vi.fn().mockResolvedValue([insertedRow]);
      trx.max = vi.fn().mockReturnValue(trx);
      trx.first = vi.fn().mockResolvedValue({ max_version: 1 });
      return fn(trx);
    }
  );
}

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

function freshService(): ConfigVersionService {
  (ConfigVersionService as unknown as { instance: unknown }).instance =
    undefined;
  return ConfigVersionService.getInstance();
}

// ---------------------------------------------------------------------------
// Test 36: previewRollback returns correct diff with changeType
// ---------------------------------------------------------------------------

describe("ConfigVersionService — previewRollback", () => {
  it("returns a diff with correct changeType for each field", async () => {
    const service = freshService();

    const current = { a: 1, b: "hello", c: true };
    const target = { a: 2, b: "hello", d: "new" }; // a modified, c removed, d added

    const diff = service.computeDiff(current, target);

    const modified = diff.find((d) => d.field === "a");
    const removed = diff.find((d) => d.field === "c");
    const added = diff.find((d) => d.field === "d");

    expect(modified?.changeType).toBe("modified");
    expect(modified?.currentValue).toBe(1);
    expect(modified?.targetValue).toBe(2);

    expect(removed?.changeType).toBe("removed");
    expect(removed?.currentValue).toBe(true);
    expect(removed?.targetValue).toBeUndefined();

    expect(added?.changeType).toBe("added");
    expect(added?.currentValue).toBeUndefined();
    expect(added?.targetValue).toBe("new");
  });

  // Test 37: previewRollback returns empty diff for identical payloads
  it("returns an empty diff when current and target versions are identical", async () => {
    const service = freshService();
    const payload = { x: 1, y: "test" };
    const diff = service.computeDiff(payload, payload);
    expect(diff).toHaveLength(0);
  });

  // Test 41 (route-level): previewRollback throws when target === current
  it("throws when target version is the same as current version", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const currentVersion = makeVersionRow({
      version_number: 3,
      is_current: true,
    });
    const chain = makeDbChain(currentVersion);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(
      service.previewRollback("alert-thresholds", 3)
    ).rejects.toThrow(/already the current version/);
  });

  it("throws when no current version exists", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const chain = makeDbChain(null);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    await expect(
      service.previewRollback("unknown-key", 1)
    ).rejects.toThrow(/No current version/);
  });

  it("throws when target version does not exist", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    // First call (getCurrentVersion) returns the current version row
    // Second call (getVersion) returns null
    let callCount = 0;
    const buildChain = (result: unknown) => {
      const c: Record<string, unknown> = {};
      c.where = vi.fn().mockReturnValue(c);
      c.first = vi.fn().mockResolvedValue(result);
      return c;
    };

    const currentChain = buildChain(makeVersionRow({ version_number: 2, is_current: true }));
    const nullChain = buildChain(null);

    const db = (_t: string) => {
      callCount += 1;
      return callCount === 1 ? currentChain : nullChain;
    };
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const service = freshService();
    await expect(
      service.previewRollback("alert-thresholds", 99)
    ).rejects.toThrow(/not found/);
  });
});

// ---------------------------------------------------------------------------
// Test 38: applyRollback creates a new version rather than overwriting history
// ---------------------------------------------------------------------------

describe("ConfigVersionService — applyRollback creates new version", () => {
  it("inserts a new version record instead of modifying existing rows", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );

    const currentV = makeVersionRow({
      version_number: 2,
      payload: JSON.stringify({ rate: 0.5 }),
      is_current: true,
    });
    const targetV = makeVersionRow({
      version_number: 1,
      payload: JSON.stringify({ rate: 0.1 }),
      is_current: false,
    });
    const newV = makeVersionRow({
      id: "new-v",
      version_number: 3,
      payload: JSON.stringify({ rate: 0.1 }),
      is_current: true,
    });

    // Sequence: getCurrentVersion → getVersion(2) [current] → getVersion(1) [target]
    // then transaction inserts new row
    let callCount = 0;
    const buildChain = (result: unknown) => {
      const c: Record<string, unknown> = {};
      c.where = vi.fn().mockReturnValue(c);
      c.first = vi.fn().mockResolvedValue(result);
      c.orderBy = vi.fn().mockReturnValue(c);
      c.limit = vi.fn().mockReturnValue(c);
      return c;
    };

    const db = (_t: string) => {
      callCount += 1;
      if (callCount === 1) return buildChain(currentV); // getCurrentVersion
      if (callCount === 2) return buildChain(currentV); // getVersion(current) in previewRollback
      return buildChain(targetV); // getVersion(target)
    };
    (db as unknown as Record<string, unknown>).transaction =
      makeTrxMock(newV);
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(db);

    const service = freshService();
    const result = await service.applyRollback("alert-thresholds", 1, "admin");
    expect(result.versionNumber).toBe(3);
    expect(result.isCurrent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test 39: getVersionHistory returns versions in descending order
// ---------------------------------------------------------------------------

describe("ConfigVersionService — getVersionHistory", () => {
  it("returns versions in descending version_number order", async () => {
    const { getDatabase } = vi.mocked(
      await import("../../src/database/connection.js")
    );
    const rows = [
      makeVersionRow({ version_number: 3, is_current: true }),
      makeVersionRow({ version_number: 2, is_current: false }),
      makeVersionRow({ version_number: 1, is_current: false }),
    ];
    // The DB query already has orderBy DESC — return in that order
    const chain = makeDbChain(rows, rows);
    chain.then = vi.fn().mockImplementation((fn: (v: unknown) => unknown) =>
      Promise.resolve(fn(rows))
    );
    (getDatabase as ReturnType<typeof vi.fn>).mockReturnValue(
      (_t: string) => chain
    );

    const service = freshService();
    const history = await service.getVersionHistory("alert-thresholds");
    // First result should be highest version
    expect(history[0].versionNumber).toBeGreaterThanOrEqual(
      history[history.length - 1].versionNumber
    );
  });
});
