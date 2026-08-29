import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { SensitiveFieldAccessService } from "../../src/services/sensitiveFieldAccess.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  createChildLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

let currentChain: Record<string, unknown> = {};

function makeDefRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "def-1",
    resource_name: "api_keys",
    field_name: "secret",
    sensitivity_level: "critical",
    description: "API Key secret",
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeLogRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "log-1",
    resource_name: "api_keys",
    field_name: "secret",
    actor_id: "usr-admin",
    actor_role: "admin",
    access_type: "read",
    reason: "Audit check",
    ip_address: "127.0.0.1",
    user_agent: "Vitest",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeReportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rep-1",
    title: "SOC2 Compliance Report",
    time_range_start: new Date(Date.now() - 86400000).toISOString(),
    time_range_end: new Date().toISOString(),
    sensitivity_filter: null,
    total_accesses: 1,
    unique_actors: 1,
    critical_accesses: 1,
    summary_json: JSON.stringify({ total: 1 }),
    generated_by: "system",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeChain(rows: unknown[] = [], updated?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockImplementation(() => chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(rows[0]);
  chain.onConflict = vi.fn().mockReturnValue(chain);
  chain.merge = vi.fn().mockReturnValue(chain);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue([updated ?? rows[0] ?? makeDefRow()]);
  chain.then = vi.fn().mockImplementation((resolve) => { resolve(rows); return Promise.resolve(); });
  currentChain = chain;
  return chain;
}

function dbMock() {
  const dbFn = vi.fn().mockImplementation((_table: string) => currentChain);
  (dbFn as unknown as Record<string, unknown>).fn = { now: () => new Date().toISOString() };
  return dbFn as never;
}

describe("SensitiveFieldAccessService", () => {
  let service: SensitiveFieldAccessService;

  beforeEach(() => {
    service = new SensitiveFieldAccessService();
    makeChain([makeDefRow()]);
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("lists active field definitions", async () => {
    const defs = await service.listDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].resourceName).toBe("api_keys");
    expect(defs[0].fieldName).toBe("secret");
  });

  it("creates or updates a sensitive field definition", async () => {
    makeChain([], makeDefRow({ field_name: "private_key" }));
    const created = await service.createDefinition({
      resourceName: "bridge_wallets",
      fieldName: "private_key",
      sensitivityLevel: "critical",
    });
    expect(created.fieldName).toBe("private_key");
  });

  it("logs a sensitive field access event", async () => {
    makeChain([], makeLogRow());
    const log = await service.logAccess({
      resourceName: "api_keys",
      fieldName: "secret",
      actorId: "usr-admin",
    });
    expect(log.actorId).toBe("usr-admin");
  });

  it("generates a compliance report", async () => {
    makeChain([makeLogRow()], makeReportRow());
    const report = await service.generateReport({
      title: "SOC2 Compliance Report",
      timeRangeStart: new Date(Date.now() - 86400000).toISOString(),
      timeRangeEnd: new Date().toISOString(),
    });
    expect(report.title).toBe("SOC2 Compliance Report");
  });
});
