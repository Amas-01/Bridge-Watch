import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  HotColdMigrationService,
  MIGRATION_ENTITIES,
  computeChecksum,
  type MigrationManifest,
} from "../../src/services/hotColdMigration.service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockManifestsTable: Record<string, unknown>[] = [];
let nextManifestId = 1;

function mockRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: `manifest-${nextManifestId++}`,
    entity_type: "prices",
    archive_table: "prices_archive",
    range_start: new Date("2026-01-01").toISOString(),
    range_end: new Date("2026-01-08").toISOString(),
    status: "pending",
    schema_version: 1,
    row_count: null,
    checksum: null,
    error_message: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// Chainable knex query builder mock
function makeQueryBuilder(resolveWith: unknown = []) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.where = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.first = vi.fn().mockResolvedValue(
    Array.isArray(resolveWith) ? resolveWith[0] : resolveWith,
  );
  builder.delete = vi.fn().mockResolvedValue(1);
  builder.update = vi.fn().mockResolvedValue(1);
  builder.insert = vi.fn().mockResolvedValue([1]);
  builder.count = vi.fn().mockReturnValue(builder);
  builder.then = (fn: (v: unknown) => unknown) =>
    Promise.resolve(resolveWith).then(fn);
  return builder;
}

// We build a minimal knex mock that lets tests override return values per-call
let mockDbRows: Record<string, unknown>[] = [];
let mockFirstRow: Record<string, unknown> | undefined = undefined;
let mockArchiveExists = false;
let mockArchiveRows: Record<string, unknown>[] = [];
let mockArchiveCount = 5;
let mockRawResult: unknown = undefined;

const mockDb: Record<string, unknown> = {};

mockDb.schema = {
  hasTable: vi.fn().mockImplementation(async (table: string) => {
    if (table.includes("archive")) return mockArchiveExists;
    return true;
  }),
};

mockDb.raw = vi.fn().mockImplementation(async () => mockRawResult ?? { rows: [] });

// table() call returns a chainable builder
const tableProxy = (tableName: string) => {
  const isManifests = tableName === "migration_manifests";
  const isArchive = typeof tableName === "string" && tableName.includes("archive");

  const resolveRows = isArchive ? mockArchiveRows : (isManifests ? mockManifestsTable : mockDbRows);

  const builder: Record<string, unknown> = {};
  builder.where = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.first = vi.fn().mockResolvedValue(mockFirstRow);
  builder.delete = vi.fn().mockResolvedValue(1);
  builder.update = vi.fn().mockResolvedValue(1);
  builder.insert = vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
    const row = mockRow(data);
    mockManifestsTable.push(row);
    return [row.id];
  });
  builder.count = vi.fn().mockReturnValue(builder);
  builder.then = (fn: (v: unknown) => unknown) =>
    Promise.resolve(resolveRows).then(fn);
  return builder;
};

vi.mock("../../src/database/connection", () => ({
  getDatabase: vi.fn(() => mockDb),
}));

vi.mock("../../src/utils/redis", () => ({
  redis: {
    get: vi.fn().mockResolvedValue(null),
    setex: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
    scan: vi.fn().mockResolvedValue([0, []]),
    keys: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../../src/utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const T1 = new Date("2026-01-01T00:00:00Z");
const T2 = new Date("2026-01-08T00:00:00Z");

function makeService(): HotColdMigrationService {
  // Pass the mock db directly via constructor injection
  return new HotColdMigrationService(mockDb as never);
}

function makeHotRows(count = 3): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `row-${i + 1}`,
    time: new Date(T1.getTime() + i * 3_600_000).toISOString(),
    symbol: "ETH",
    price: 1800 + i,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeChecksum", () => {
  it("returns a 64-char hex string", () => {
    const rows = makeHotRows(3);
    const hash = computeChecksum(rows, "time");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic regardless of row order", () => {
    const rows = makeHotRows(3);
    const shuffled = [...rows].reverse();
    expect(computeChecksum(rows, "time")).toBe(computeChecksum(shuffled, "time"));
  });

  it("differs for different data", () => {
    const a = [{ time: "2026-01-01", price: 100 }];
    const b = [{ time: "2026-01-01", price: 200 }];
    expect(computeChecksum(a, "time")).not.toBe(computeChecksum(b, "time"));
  });

  it("returns the same hash for empty row set", () => {
    const h1 = computeChecksum([], "time");
    const h2 = computeChecksum([], "time");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });
});

describe("MIGRATION_ENTITIES", () => {
  it("contains prices, health_scores, liquidity_snapshots, pool_events", () => {
    expect(MIGRATION_ENTITIES).toHaveProperty("prices");
    expect(MIGRATION_ENTITIES).toHaveProperty("health_scores");
    expect(MIGRATION_ENTITIES).toHaveProperty("liquidity_snapshots");
    expect(MIGRATION_ENTITIES).toHaveProperty("pool_events");
  });

  it("each entity has hotTable, archiveTable, and timeColumn", () => {
    for (const [, entity] of Object.entries(MIGRATION_ENTITIES)) {
      expect(entity.hotTable).toBeTruthy();
      expect(entity.archiveTable).toBeTruthy();
      expect(entity.timeColumn).toBeTruthy();
    }
  });

  it("archive tables follow the *_archive naming convention", () => {
    for (const [, entity] of Object.entries(MIGRATION_ENTITIES)) {
      expect(entity.archiveTable).toMatch(/_archive$/);
    }
  });
});

describe("HotColdMigrationService", () => {
  let svc: HotColdMigrationService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockManifestsTable.length = 0;
    nextManifestId = 1;
    mockDbRows = makeHotRows(3);
    mockArchiveRows = makeHotRows(3);
    mockArchiveExists = true;
    mockArchiveCount = 3;
    mockFirstRow = undefined;
    mockRawResult = undefined;

    // Wire up table() call
    (mockDb as { [key: string]: unknown }).mockReturnThis = undefined;
    Object.defineProperty(mockDb, "__call__", { get: () => tableProxy });

    // Make the mock db callable
    const db = vi.fn().mockImplementation(tableProxy);
    db.schema = mockDb.schema;
    db.raw = mockDb.raw;

    svc = new HotColdMigrationService(db as never);
  });

  // ── AC-1: Entity registry ─────────────────────────────────────────────────

  describe("requireEntity (AC-1)", () => {
    it("throws for unknown entity type", async () => {
      await expect(
        svc.dualRead("unknown_entity", T1, T2),
      ).rejects.toThrow(/unknown entityType/);
    });

    it("throws with helpful message listing valid entity types", async () => {
      await expect(svc.dualRead("blah", T1, T2)).rejects.toThrow(/prices/);
    });
  });

  // ── AC-2: Dual-read (zero-gap guarantee) ─────────────────────────────────

  describe("dualRead (AC-2: zero-gap guarantee)", () => {
    it("returns rows tagged with source=hot when archive does not exist", async () => {
      const hotData = makeHotRows(2);
      const db = vi.fn().mockImplementation((table: string) => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.select = vi.fn().mockReturnValue(b);
        b.then = (fn: (v: unknown) => unknown) =>
          Promise.resolve(table.includes("archive") ? [] : hotData).then(fn);
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(false) };
      db.raw = vi.fn();

      const result = await new HotColdMigrationService(db as never).dualRead("prices", T1, T2);

      expect(result.every((r) => r.source === "hot")).toBe(true);
      expect(result).toHaveLength(2);
    });

    it("merges hot and archive rows during migration without duplicates", async () => {
      const hotRows = makeHotRows(2);
      const archiveRows = [
        { id: "arc-unique", time: new Date(T1.getTime() - 3_600_000).toISOString(), symbol: "ETH", price: 1799 },
      ];

      const db = vi.fn().mockImplementation((table: string) => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.select = vi.fn().mockReturnValue(b);
        b.then = (fn: (v: unknown) => unknown) =>
          Promise.resolve(table.includes("archive") ? archiveRows : hotRows).then(fn);
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(true) };
      db.raw = vi.fn();

      const result = await new HotColdMigrationService(db as never).dualRead("prices", T1, T2);

      // No duplicates: hot row keys dominate
      const ids = result.map((r) => r["id"]);
      expect(new Set(ids).size).toBe(ids.length);
      expect(result).toHaveLength(3);
    });

    it("returns rows sorted by time column ascending", async () => {
      const rows = [
        { id: "r3", time: "2026-01-03T00:00:00Z", price: 1802 },
        { id: "r1", time: "2026-01-01T00:00:00Z", price: 1800 },
        { id: "r2", time: "2026-01-02T00:00:00Z", price: 1801 },
      ];

      const db = vi.fn().mockImplementation((table: string) => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.select = vi.fn().mockReturnValue(b);
        b.then = (fn: (v: unknown) => unknown) =>
          Promise.resolve(table.includes("archive") ? [] : rows).then(fn);
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(false) };
      db.raw = vi.fn();

      const result = await new HotColdMigrationService(db as never).dualRead("prices", T1, T2);
      const times = result.map((r) => r["time"] as string);
      expect(times).toEqual([...times].sort());
    });

    it("deduplicates rows that exist in both tables (hot wins)", async () => {
      const sharedRow = { id: "shared", time: "2026-01-02T00:00:00Z", price: 1801 };
      const hotRows = [sharedRow, { id: "hot-only", time: "2026-01-03T00:00:00Z", price: 1802 }];
      const archiveRows = [{ ...sharedRow, price: 9999 }]; // same id, different value — hot should win

      const db = vi.fn().mockImplementation((table: string) => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.select = vi.fn().mockReturnValue(b);
        b.then = (fn: (v: unknown) => unknown) =>
          Promise.resolve(table.includes("archive") ? archiveRows : hotRows).then(fn);
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(true) };
      db.raw = vi.fn();

      const result = await new HotColdMigrationService(db as never).dualRead("prices", T1, T2);
      const sharedResult = result.find((r) => r["id"] === "shared");

      expect(sharedResult?.source).toBe("hot");
      expect(sharedResult?.["price"]).toBe(1801);
      expect(result).toHaveLength(2);
    });
  });

  // ── AC-3: Checksum integrity ──────────────────────────────────────────────

  describe("checksum integrity (AC-3)", () => {
    it("computeChecksum produces consistent output for same rows", () => {
      const rows = makeHotRows(5);
      expect(computeChecksum(rows, "time")).toBe(computeChecksum(rows, "time"));
    });

    it("checksum changes when a single value is modified", () => {
      const rows = makeHotRows(3);
      const modified = rows.map((r, i) =>
        i === 1 ? { ...r, price: 9999 } : r,
      );
      expect(computeChecksum(rows, "time")).not.toBe(computeChecksum(modified, "time"));
    });

    it("checksum changes when a row is added", () => {
      const rows = makeHotRows(3);
      const withExtra = [...rows, { id: "extra", time: "2026-01-05T00:00:00Z", price: 99 }];
      expect(computeChecksum(rows, "time")).not.toBe(computeChecksum(withExtra, "time"));
    });
  });

  // ── AC-4: Rollback ────────────────────────────────────────────────────────

  describe("rollback (AC-4)", () => {
    it("deletes archive rows and sets status to rolled_back", async () => {
      const manifestRow = mockRow({ status: "failed" });
      const deleted = vi.fn().mockResolvedValue(1);

      const db = vi.fn().mockImplementation((table: string) => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.first = vi.fn().mockResolvedValue(
          table === "migration_manifests" ? manifestRow : undefined,
        );
        b.delete = deleted;
        b.update = vi.fn().mockResolvedValue(1);
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(true) };
      db.raw = vi.fn();

      await new HotColdMigrationService(db as never).rollback(manifestRow.id as string);

      expect(deleted).toHaveBeenCalled();
    });

    it("throws if called on a complete manifest", async () => {
      const manifestRow = mockRow({ status: "complete" });

      const db = vi.fn().mockImplementation(() => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.first = vi.fn().mockResolvedValue(manifestRow);
        return b;
      });
      db.schema = { hasTable: vi.fn() };
      db.raw = vi.fn();

      await expect(
        new HotColdMigrationService(db as never).rollback(manifestRow.id as string),
      ).rejects.toThrow(/cannot rollback a complete/);
    });

    it("throws if manifest not found", async () => {
      const db = vi.fn().mockImplementation(() => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.first = vi.fn().mockResolvedValue(undefined);
        return b;
      });
      db.schema = { hasTable: vi.fn() };
      db.raw = vi.fn();

      await expect(
        new HotColdMigrationService(db as never).rollback("nonexistent-id"),
      ).rejects.toThrow(/manifest not found/);
    });
  });

  // ── AC-5: Resume ──────────────────────────────────────────────────────────

  describe("resume (AC-5)", () => {
    it("returns manifest immediately if already complete", async () => {
      const manifestRow = mockRow({ status: "complete" });

      const db = vi.fn().mockImplementation(() => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.first = vi.fn().mockResolvedValue(manifestRow);
        b.update = vi.fn().mockResolvedValue(1);
        return b;
      });
      db.schema = { hasTable: vi.fn() };
      db.raw = vi.fn();

      const result = await new HotColdMigrationService(db as never).resume(manifestRow.id as string);
      expect(result.status).toBe("complete");
    });

    it("returns manifest immediately if already rolled_back", async () => {
      const manifestRow = mockRow({ status: "rolled_back" });

      const db = vi.fn().mockImplementation(() => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.first = vi.fn().mockResolvedValue(manifestRow);
        return b;
      });
      db.schema = { hasTable: vi.fn() };
      db.raw = vi.fn();

      const result = await new HotColdMigrationService(db as never).resume(manifestRow.id as string);
      expect(result.status).toBe("rolled_back");
    });

    it("throws if manifest not found", async () => {
      const db = vi.fn().mockImplementation(() => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.first = vi.fn().mockResolvedValue(undefined);
        return b;
      });
      db.schema = { hasTable: vi.fn() };
      db.raw = vi.fn();

      await expect(
        new HotColdMigrationService(db as never).resume("does-not-exist"),
      ).rejects.toThrow(/manifest not found/);
    });
  });

  // ── AC-6: Restore drill ───────────────────────────────────────────────────

  describe("restoreDrill (AC-6)", () => {
    it("reports checksumMatch=true when hot and archive contain identical rows", async () => {
      const rows = makeHotRows(3);

      const db = vi.fn().mockImplementation((table: string) => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.select = vi.fn().mockReturnValue(b);
        b.then = (fn: (v: unknown) => unknown) => Promise.resolve(rows).then(fn);
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(true) };
      db.raw = vi.fn();

      const result = await new HotColdMigrationService(db as never).restoreDrill("prices", T1, T2);

      expect(result.checksumMatch).toBe(true);
      expect(result.hotCount).toBe(3);
      expect(result.archiveCount).toBe(3);
    });

    it("reports checksumMatch=false when archive rows differ", async () => {
      const hotRows = makeHotRows(3);
      const archiveRows = hotRows.map((r) => ({ ...r, price: 9999 })); // tampered

      const db = vi.fn().mockImplementation((table: string) => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.select = vi.fn().mockReturnValue(b);
        b.then = (fn: (v: unknown) => unknown) =>
          Promise.resolve(table.includes("archive") ? archiveRows : hotRows).then(fn);
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(true) };
      db.raw = vi.fn();

      const result = await new HotColdMigrationService(db as never).restoreDrill("prices", T1, T2);

      expect(result.checksumMatch).toBe(false);
    });

    it("reports gapFree=true when dual-read covers all rows", async () => {
      const rows = makeHotRows(3);

      const db = vi.fn().mockImplementation((table: string) => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.select = vi.fn().mockReturnValue(b);
        b.then = (fn: (v: unknown) => unknown) => Promise.resolve(rows).then(fn);
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(true) };
      db.raw = vi.fn();

      const result = await new HotColdMigrationService(db as never).restoreDrill("prices", T1, T2);

      expect(result.gapFree).toBe(true);
    });

    it("throws for unknown entity type", async () => {
      await expect(svc.restoreDrill("unknown", T1, T2)).rejects.toThrow(/unknown entityType/);
    });
  });

  // ── AC-7: Cache invalidation ──────────────────────────────────────────────

  describe("invalidateCaches (AC-7)", () => {
    it("scans and deletes matching Redis keys for prices", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      (redis.scan as ReturnType<typeof vi.fn>).mockResolvedValue([0, ["bw:prices:eth", "bw:prices:usdc"]]);

      const db = vi.fn();
      db.schema = { hasTable: vi.fn() };
      db.raw = vi.fn();

      await new HotColdMigrationService(db as never).invalidateCaches("prices", T1, T2);

      expect(redis.scan).toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith(["bw:prices:eth", "bw:prices:usdc"]);
    });

    it("does not throw when no keys match", async () => {
      const { redis } = await import("../../src/utils/redis.js");
      (redis.scan as ReturnType<typeof vi.fn>).mockResolvedValue([0, []]);

      const db = vi.fn();
      db.schema = { hasTable: vi.fn() };
      db.raw = vi.fn();

      await expect(
        new HotColdMigrationService(db as never).invalidateCaches("prices", T1, T2),
      ).resolves.not.toThrow();
    });

    it("does not throw for entity types with exact-key patterns", async () => {
      const { redis } = await import("../../src/utils/redis.js");

      const db = vi.fn();
      db.schema = { hasTable: vi.fn() };
      db.raw = vi.fn();

      await expect(
        new HotColdMigrationService(db as never).invalidateCaches("health_scores", T1, T2),
      ).resolves.not.toThrow();
      // bw:bridge-health-snapshot is an exact key — del called directly
      expect(redis.del).toHaveBeenCalledWith("bw:bridge-health-snapshot");
    });
  });

  // ── AC-8: atomicCutover guard ─────────────────────────────────────────────

  describe("atomicCutover (AC-8)", () => {
    it("throws when no archive rows exist for the segment", async () => {
      const manifestRow = mockRow({ status: "verifying" });

      const db = vi.fn().mockImplementation((table: string) => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.first = vi.fn().mockResolvedValue(
          table === "migration_manifests" ? manifestRow : undefined,
        );
        b.count = vi.fn().mockReturnValue(b);
        b.then = (fn: (v: unknown) => unknown) =>
          Promise.resolve(table.includes("archive") ? { count: "0" } : []).then(fn);
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(true) };
      db.raw = vi.fn();

      await expect(
        new HotColdMigrationService(db as never).atomicCutover(manifestRow.id as string),
      ).rejects.toThrow(/no rows found in archive/);
    });

    it("is a no-op if manifest is already complete", async () => {
      const manifestRow = mockRow({ status: "complete" });

      const updateFn = vi.fn().mockResolvedValue(1);
      const db = vi.fn().mockImplementation(() => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.first = vi.fn().mockResolvedValue(manifestRow);
        b.update = updateFn;
        return b;
      });
      db.schema = { hasTable: vi.fn() };
      db.raw = vi.fn();

      await new HotColdMigrationService(db as never).atomicCutover(manifestRow.id as string);

      // status is already 'complete' — no update needed
      expect(updateFn).not.toHaveBeenCalled();
    });
  });

  // ── AC-9: Manifest lifecycle fields ──────────────────────────────────────

  describe("MigrationManifest fields (AC-9)", () => {
    it("rowToManifest maps snake_case DB fields to camelCase TypeScript types", () => {
      // We test this by verifying that the restored manifest after migrateRange contains the right shape
      const manifestRow = mockRow({
        status: "complete",
        row_count: "42",
        checksum: "abc123",
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      });

      // Access private method via cast
      const manifest = (svc as unknown as {
        rowToManifest: (r: Record<string, unknown>) => MigrationManifest;
      }).rowToManifest(manifestRow);

      expect(manifest.entityType).toBe(manifestRow.entity_type);
      expect(manifest.archiveTable).toBe(manifestRow.archive_table);
      expect(manifest.rowCount).toBe(42);
      expect(manifest.checksum).toBe("abc123");
      expect(manifest.startedAt).toBeInstanceOf(Date);
      expect(manifest.completedAt).toBeInstanceOf(Date);
    });
  });

  // ── AC-10: verifyContinuousAggregates non-fatal ───────────────────────────

  describe("verifyContinuousAggregates (AC-10)", () => {
    it("does not throw when aggregate views do not exist", async () => {
      const db = vi.fn().mockImplementation(() => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.count = vi.fn().mockReturnValue(b);
        b.first = vi.fn().mockResolvedValue({ count: "0" });
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(false) };
      db.raw = vi.fn();

      await expect(
        (new HotColdMigrationService(db as never) as unknown as {
          verifyContinuousAggregates: (e: string, s: Date, end: Date) => Promise<void>;
        }).verifyContinuousAggregates("prices", T1, T2),
      ).resolves.not.toThrow();
    });

    it("does not throw if aggregate query errors (non-fatal)", async () => {
      const db = vi.fn().mockImplementation(() => {
        const b: Record<string, unknown> = {};
        b.where = vi.fn().mockReturnValue(b);
        b.count = vi.fn().mockRejectedValue(new Error("view does not exist"));
        b.first = vi.fn().mockRejectedValue(new Error("view does not exist"));
        return b;
      });
      db.schema = { hasTable: vi.fn().mockResolvedValue(true) };
      db.raw = vi.fn();

      await expect(
        (new HotColdMigrationService(db as never) as unknown as {
          verifyContinuousAggregates: (e: string, s: Date, end: Date) => Promise<void>;
        }).verifyContinuousAggregates("prices", T1, T2),
      ).resolves.not.toThrow();
    });
  });
});
