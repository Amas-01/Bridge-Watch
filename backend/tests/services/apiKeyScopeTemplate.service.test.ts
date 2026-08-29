import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { ApiKeyScopeTemplateService } from "../../src/services/apiKeyScopeTemplate.service.js";

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
    trace: vi.fn(),
  }),
}));

let currentChain: Record<string, unknown> = {};

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "t1",
    name: "monitor",
    description: "Monitoring scope bundle",
    scopes: JSON.stringify(["jobs:read", "jobs:trigger"]),
    rate_limit_per_minute: 120,
    is_active: true,
    created_by: "admin",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeChain(rows: unknown[] = [], updated?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.modify = vi.fn().mockImplementation((mod: (qb: unknown) => void) => {
    mod(chain);
    return chain;
  });
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(rows[0]);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue([updated ?? rows[0] ?? makeRow()]);
  chain.then = vi.fn().mockImplementation((resolve) => { resolve(rows); return Promise.resolve(); });
  currentChain = chain;
  return chain;
}

function dbMock() {
  const dbFn = vi.fn().mockImplementation((_table: string) => currentChain);
  (dbFn as unknown as Record<string, unknown>).raw = (v: string) => ({ sql: v });
  return dbFn as never;
}

describe("ApiKeyScopeTemplateService", () => {
  let service: ApiKeyScopeTemplateService;

  beforeEach(() => {
    service = new ApiKeyScopeTemplateService();
    makeChain([makeRow()]);
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("lists active templates", async () => {
    const templates = await service.listTemplates();
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("monitor");
    expect(templates[0].scopes).toEqual(["jobs:read", "jobs:trigger"]);
  });

  it("gets a template by id", async () => {
    const template = await service.getTemplate("t1");
    expect(template?.id).toBe("t1");
  });

  it("creates a template with normalized scopes", async () => {
    makeChain([], makeRow({ id: "t2", name: "integration" }));
    const created = await service.createTemplate({
      name: "integration",
      scopes: [" jobs:read ", "jobs:read", "jobs:trigger"],
      createdBy: "admin",
    });
    expect(created.scopes).toHaveLength(2);
  });

  it("rejects a template with no name", async () => {
    await expect(
      service.createTemplate({ name: "", scopes: ["jobs:read"] })
    ).rejects.toThrow("name is required");
  });

  it("rejects a template with empty scopes", async () => {
    await expect(
      service.createTemplate({ name: "x", scopes: [] })
    ).rejects.toThrow("scope");
  });

  it("updates an existing template", async () => {
    makeChain([makeRow()], makeRow({ scopes: JSON.stringify(["jobs:read"]) }));
    const updated = await service.updateTemplate("t1", { scopes: ["jobs:read"] });
    expect(updated?.scopes).toEqual(["jobs:read"]);
  });

  it("returns null when updating a missing template", async () => {
    makeChain([], undefined);
    const updated = await service.updateTemplate("missing", { scopes: [] });
    expect(updated).toBeNull();
  });
});
