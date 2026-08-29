import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for ProviderAllowlistService.
 *
 * These exercise the real allow/deny/normalise/upsert/delete logic against a
 * small in-memory fake of the knex query builder, so the assertions cover the
 * service's behaviour rather than a set of pre-canned mock return values. The
 * database connection, audit service and logger are all replaced so the suite
 * runs without any external dependencies.
 */

type Row = Record<string, unknown>;

/**
 * Minimal in-memory stand-in for the subset of the knex query builder that
 * ProviderAllowlistService relies on. A single fake owns one `provider_allowlist`
 * table (an array of rows) and returns a fresh builder for every `db(table)` call.
 */
function createFakeDb(seedRows: Row[] = []) {
  const rows: Row[] = seedRows.map((r) => ({ ...r }));

  function builder() {
    let filter: Row | null = null;

    const matched = (): Row[] => {
      if (!filter) return rows;
      const conditions = filter;
      return rows.filter((row) =>
        Object.entries(conditions).every(([key, value]) => row[key] === value)
      );
    };

    const api = {
      select() {
        return api;
      },
      where(condition: Row) {
        filter = { ...(filter ?? {}), ...condition };
        return api;
      },
      orderBy(column: string, direction: "asc" | "desc" = "asc") {
        const sorted = [...matched()].sort((a, b) => {
          const av = a[column] as string;
          const bv = b[column] as string;
          if (av < bv) return direction === "asc" ? -1 : 1;
          if (av > bv) return direction === "asc" ? 1 : -1;
          return 0;
        });
        return Promise.resolve(sorted.map((row) => ({ ...row })));
      },
      first() {
        const [row] = matched();
        return Promise.resolve(row ? { ...row } : undefined);
      },
      insert(data: Row) {
        const inserted: Row = { ...data };
        rows.push(inserted);
        return {
          returning: () => Promise.resolve([{ ...inserted }]),
        };
      },
      update(patch: Row) {
        const affected = matched();
        affected.forEach((row) => Object.assign(row, patch));
        return {
          returning: () => Promise.resolve(affected.map((row) => ({ ...row }))),
        };
      },
      delete() {
        const affected = matched();
        affected.forEach((row) => {
          const index = rows.indexOf(row);
          if (index >= 0) rows.splice(index, 1);
        });
        return Promise.resolve(affected.length);
      },
    };

    return api;
  }

  const db = () => builder();
  return { db, rows };
}

const hoisted = vi.hoisted(() => ({
  currentDb: null as null | ((table: string) => unknown),
  auditLog: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => (table: string) => {
    if (!hoisted.currentDb) {
      throw new Error("fake database not configured for this test");
    }
    return hoisted.currentDb(table);
  }),
}));

vi.mock("../../src/services/audit.service.js", () => ({
  auditService: { log: hoisted.auditLog },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    warn: hoisted.warn,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { ProviderAllowlistService } from "../../src/services/providerAllowlist.service.js";

function makeRow(overrides: Row = {}): Row {
  const now = new Date("2024-01-01T00:00:00.000Z");
  return {
    provider_key: "circle",
    display_name: "Circle",
    category: "issuer",
    allowed: true,
    reason: null,
    created_by: "seed",
    created_at: now,
    updated_by: "seed",
    updated_at: now,
    ...overrides,
  };
}

/** Point the service at a freshly seeded fake table. */
function useDb(seedRows: Row[] = []) {
  const fake = createFakeDb(seedRows);
  hoisted.currentDb = fake.db;
  return fake;
}

describe("ProviderAllowlistService", () => {
  let service: ProviderAllowlistService;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.currentDb = null;
    service = new ProviderAllowlistService();
  });

  describe("isAllowed", () => {
    it("allows any provider when the allowlist is empty (allow-by-default)", async () => {
      useDb([]);
      await expect(service.isAllowed("circle")).resolves.toBe(true);
    });

    it("returns false for a blank provider key without touching the database", async () => {
      useDb([makeRow()]);
      await expect(service.isAllowed("   ")).resolves.toBe(false);
    });

    it("allows a provider whose entry is marked allowed", async () => {
      useDb([makeRow({ provider_key: "circle", allowed: true })]);
      await expect(service.isAllowed("circle")).resolves.toBe(true);
    });

    it("denies a provider whose entry is marked not allowed", async () => {
      useDb([makeRow({ provider_key: "circle", allowed: false })]);
      await expect(service.isAllowed("circle")).resolves.toBe(false);
    });

    it("denies a provider that is missing while the allowlist is populated", async () => {
      useDb([makeRow({ provider_key: "circle", allowed: true })]);
      await expect(service.isAllowed("tether")).resolves.toBe(false);
    });

    it("normalises the provider key (trim + lowercase) before matching", async () => {
      useDb([makeRow({ provider_key: "circle", allowed: true })]);
      await expect(service.isAllowed("  CIRCLE  ")).resolves.toBe(true);
    });

    it("fails open and logs a warning when the database throws", async () => {
      hoisted.currentDb = () => {
        throw new Error("connection refused");
      };
      await expect(service.isAllowed("circle")).resolves.toBe(true);
      expect(hoisted.warn).toHaveBeenCalledTimes(1);
    });
  });

  describe("getEntry", () => {
    it("returns a mapped entry when the provider exists", async () => {
      useDb([
        makeRow({
          provider_key: "circle",
          display_name: "Circle",
          category: "issuer",
          allowed: true,
          reason: "trusted",
        }),
      ]);

      const entry = await service.getEntry("Circle");

      expect(entry).not.toBeNull();
      expect(entry).toMatchObject({
        providerKey: "circle",
        displayName: "Circle",
        category: "issuer",
        allowed: true,
        reason: "trusted",
      });
      expect(entry?.createdAt).toBeInstanceOf(Date);
    });

    it("returns null when the provider is not on the allowlist", async () => {
      useDb([makeRow({ provider_key: "circle" })]);
      await expect(service.getEntry("unknown")).resolves.toBeNull();
    });
  });

  describe("listEntries", () => {
    it("returns every entry ordered by provider key ascending", async () => {
      useDb([
        makeRow({ provider_key: "tether" }),
        makeRow({ provider_key: "anchorage" }),
        makeRow({ provider_key: "circle" }),
      ]);

      const entries = await service.listEntries();

      expect(entries.map((e) => e.providerKey)).toEqual([
        "anchorage",
        "circle",
        "tether",
      ]);
    });

    it("returns an empty array when there are no entries", async () => {
      useDb([]);
      await expect(service.listEntries()).resolves.toEqual([]);
    });
  });

  describe("upsertEntry", () => {
    it("inserts a new entry with sensible defaults and writes an audit log", async () => {
      const fake = useDb([]);

      const result = await service.upsertEntry({
        providerKey: "  NewCo  ",
        allowed: true,
        actorId: "admin-1",
      });

      expect(result).toMatchObject({
        providerKey: "newco",
        displayName: "newco",
        category: "unknown",
        allowed: true,
        createdBy: "admin-1",
        updatedBy: "admin-1",
      });
      expect(fake.rows).toHaveLength(1);

      expect(hoisted.auditLog).toHaveBeenCalledTimes(1);
      const auditArg = hoisted.auditLog.mock.calls[0][0];
      expect(auditArg).toMatchObject({
        action: "admin.provider_allowlist_changed",
        actorId: "admin-1",
        actorType: "api_key",
        resourceType: "provider_allowlist",
        resourceId: "newco",
      });
      expect(auditArg.before).toBeUndefined();
      expect(auditArg.after).toMatchObject({ providerKey: "newco" });
    });

    it("updates an existing entry and records before/after in the audit log", async () => {
      const fake = useDb([
        makeRow({
          provider_key: "circle",
          display_name: "Circle",
          allowed: true,
          reason: "trusted",
        }),
      ]);

      const result = await service.upsertEntry({
        providerKey: "circle",
        allowed: false,
        reason: "compliance review",
        actorId: "admin-2",
        actorType: "user",
      });

      expect(result).toMatchObject({
        providerKey: "circle",
        allowed: false,
        reason: "compliance review",
        updatedBy: "admin-2",
      });
      // No new row created — the existing one was updated in place.
      expect(fake.rows).toHaveLength(1);
      expect(fake.rows[0].allowed).toBe(false);

      expect(hoisted.auditLog).toHaveBeenCalledTimes(1);
      const auditArg = hoisted.auditLog.mock.calls[0][0];
      expect(auditArg.actorType).toBe("user");
      expect(auditArg.before).toMatchObject({ providerKey: "circle", allowed: true });
      expect(auditArg.after).toMatchObject({ providerKey: "circle", allowed: false });
    });

    it("preserves existing display name and category when they are not supplied", async () => {
      useDb([
        makeRow({
          provider_key: "circle",
          display_name: "Circle Internet Financial",
          category: "issuer",
        }),
      ]);

      const result = await service.upsertEntry({
        providerKey: "circle",
        allowed: true,
        actorId: "admin-3",
      });

      expect(result.displayName).toBe("Circle Internet Financial");
      expect(result.category).toBe("issuer");
    });
  });

  describe("deleteEntry", () => {
    it("deletes an existing entry, returns true and writes an audit log", async () => {
      const fake = useDb([makeRow({ provider_key: "circle" })]);

      const result = await service.deleteEntry({
        providerKey: "Circle",
        actorId: "admin-9",
      });

      expect(result).toBe(true);
      expect(fake.rows).toHaveLength(0);

      expect(hoisted.auditLog).toHaveBeenCalledTimes(1);
      const auditArg = hoisted.auditLog.mock.calls[0][0];
      expect(auditArg).toMatchObject({
        action: "admin.provider_allowlist_changed",
        resourceId: "circle",
      });
      expect(auditArg.before).toMatchObject({ providerKey: "circle" });
      expect(auditArg.after).toBeNull();
    });

    it("returns false and does not audit when the entry does not exist", async () => {
      useDb([makeRow({ provider_key: "circle" })]);

      const result = await service.deleteEntry({
        providerKey: "missing",
        actorId: "admin-9",
      });

      expect(result).toBe(false);
      expect(hoisted.auditLog).not.toHaveBeenCalled();
    });
  });
});
