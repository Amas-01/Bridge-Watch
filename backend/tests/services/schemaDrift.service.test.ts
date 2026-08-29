import { describe, it, expect, vi, beforeEach } from "vitest";

// A flexible knex-style query-builder mock. Every chainable method returns the
// same builder; `.first()` resolves the configurable baseline row and awaiting
// the builder directly (insert/merge/groupBy chains) resolves `queryResult`.
const h = vi.hoisted(() => {
  const state = { baselineRow: null as unknown, queryResult: [] as unknown };
  const builder: Record<string, ReturnType<typeof vi.fn>> & {
    first?: ReturnType<typeof vi.fn>;
    then?: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise<unknown>;
  } = {};

  const chainMethods = [
    "where",
    "andWhere",
    "insert",
    "onConflict",
    "merge",
    "select",
    "count",
    "max",
    "groupBy",
    "orderBy",
    "limit",
    "update",
    "returning",
  ];
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }
  builder.first = vi.fn(() => Promise.resolve(state.baselineRow));
  builder.then = (resolve, reject) => Promise.resolve(state.queryResult).then(resolve, reject);

  const db = vi.fn(() => builder) as ReturnType<typeof vi.fn> & {
    raw: ReturnType<typeof vi.fn>;
    fn: { now: ReturnType<typeof vi.fn> };
  };
  db.raw = vi.fn((sql: string) => ({ __raw: sql }));
  db.fn = { now: vi.fn(() => "NOW()") };

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

  return { state, builder, db, logger };
});

vi.mock("../../src/database/connection", () => ({
  getDatabase: () => h.db,
}));

vi.mock("../../src/utils/logger", () => ({
  createChildLogger: () => h.logger,
}));

vi.mock("../../src/services/alert.service", () => ({
  AlertService: vi.fn(() => ({})),
}));

import { SchemaDriftService } from "../../src/services/schemaDrift.service";

describe("SchemaDriftService", () => {
  let service: SchemaDriftService;

  beforeEach(() => {
    vi.clearAllMocks();
    h.state.baselineRow = null;
    h.state.queryResult = [];
    service = new SchemaDriftService();
  });

  describe("checkDrift", () => {
    it("creates a baseline and reports no drift when none exists", async () => {
      h.state.baselineRow = null;

      const report = await service.checkDrift("source-a", { name: "x", value: 1 });

      expect(report.sourceName).toBe("source-a");
      expect(report.hasDrift).toBe(false);
      expect(report.incidents).toEqual([]);
      expect(h.db).toHaveBeenCalledWith("schema_baselines");
      expect(h.builder.insert).toHaveBeenCalledTimes(1);

      const insertArg = h.builder.insert.mock.calls[0][0] as {
        source_name: string;
        schema_definition: string;
      };
      expect(insertArg.source_name).toBe("source-a");
      expect(JSON.parse(insertArg.schema_definition)).toMatchObject({
        root: "object",
        name: "string",
        value: "number",
      });
      expect(h.logger.info).toHaveBeenCalled();
    });

    it("reports no drift when the payload matches the baseline", async () => {
      h.state.baselineRow = {
        schema_definition: { root: "object", name: "string", value: "number" },
      };

      const report = await service.checkDrift("source-a", { name: "x", value: 1 });

      expect(report.hasDrift).toBe(false);
      expect(report.incidents).toEqual([]);
      // No baseline save and no incident recording when nothing changed.
      expect(h.builder.insert).not.toHaveBeenCalled();
    });

    it("flags an added field as a non-breaking ADDITION", async () => {
      h.state.baselineRow = {
        schema_definition: { root: "object", name: "string" },
      };

      const report = await service.checkDrift("source-a", { name: "x", extra: true });

      expect(report.hasDrift).toBe(true);
      expect(report.incidents).toHaveLength(1);
      expect(report.incidents[0]).toMatchObject({
        driftType: "ADDITION",
        fieldPath: "extra",
        actualType: "boolean",
        isBreaking: false,
      });
      expect(h.builder.insert).toHaveBeenCalledTimes(1);
      expect(h.logger.warn).toHaveBeenCalled();
    });

    it("flags a removed field as a breaking REMOVAL", async () => {
      h.state.baselineRow = {
        schema_definition: { root: "object", name: "string", value: "number" },
      };

      const report = await service.checkDrift("source-a", { name: "x" });

      expect(report.hasDrift).toBe(true);
      expect(report.incidents).toHaveLength(1);
      expect(report.incidents[0]).toMatchObject({
        driftType: "REMOVAL",
        fieldPath: "value",
        expectedType: "number",
        isBreaking: true,
      });
      expect(h.logger.error).toHaveBeenCalled();
    });

    it("flags a changed field type as a breaking TYPE_CHANGE", async () => {
      h.state.baselineRow = {
        schema_definition: { root: "object", value: "number" },
      };

      const report = await service.checkDrift("source-a", { value: "now-a-string" });

      expect(report.hasDrift).toBe(true);
      expect(report.incidents).toHaveLength(1);
      expect(report.incidents[0]).toMatchObject({
        driftType: "TYPE_CHANGE",
        fieldPath: "value",
        expectedType: "number",
        actualType: "string",
        isBreaking: true,
      });
    });

    it("records both breaking and non-breaking incidents together", async () => {
      h.state.baselineRow = {
        schema_definition: { root: "object", removed: "string" },
      };

      const report = await service.checkDrift("source-a", { added: 1 });

      expect(report.hasDrift).toBe(true);
      const types = report.incidents.map((i) => i.driftType);
      expect(types).toEqual(expect.arrayContaining(["REMOVAL", "ADDITION"]));

      const records = h.builder.insert.mock.calls[0][0] as unknown[];
      expect(records).toHaveLength(2);
      expect(h.logger.error).toHaveBeenCalled();
      expect(h.logger.warn).toHaveBeenCalled();
    });

    it("extracts schema from nested objects, arrays, and nulls", async () => {
      h.state.baselineRow = null;

      await service.checkDrift("nested", {
        list: [{ a: 1 }],
        meta: null,
      });

      const insertArg = h.builder.insert.mock.calls[0][0] as { schema_definition: string };
      const schema = JSON.parse(insertArg.schema_definition);
      expect(schema).toMatchObject({
        root: "object",
        list: "array",
        "list[]": "object",
        "list[].a": "number",
        meta: "null",
      });
    });
  });

  describe("getDriftReport", () => {
    it("returns the incident summary and recent incidents", async () => {
      h.state.queryResult = [{ source_name: "source-a", incident_count: 3 }];

      const report = await service.getDriftReport();

      expect(report).toHaveProperty("summary");
      expect(report).toHaveProperty("recentIncidents");
      expect(report.summary).toEqual(h.state.queryResult);
    });
  });
});
