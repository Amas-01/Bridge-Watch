import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { SecurityEventCorrelationService } from "../../src/services/securityEventCorrelation.service.js";

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

function makeCorrelationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sec-c1",
    title: "Auth Failure Spike",
    description: "Spike in auth failures",
    severity: "high",
    status: "active",
    correlation_rule: JSON.stringify({ threshold: 10 }),
    event_count: 5,
    source_systems: JSON.stringify(["auth-service"]),
    time_window_minutes: 30,
    created_by: "admin",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ev-1",
    correlation_id: "sec-c1",
    event_type: "auth_failure",
    source: "auth-service",
    severity: "high",
    actor: "192.168.1.1",
    ip_address: "192.168.1.1",
    details: JSON.stringify({ path: "/login" }),
    timestamp: new Date().toISOString(),
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
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.increment = vi.fn().mockResolvedValue(1);
  chain.first = vi.fn().mockResolvedValue(rows[0]);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue([updated ?? rows[0] ?? makeCorrelationRow()]);
  chain.then = vi.fn().mockImplementation((resolve) => { resolve(rows); return Promise.resolve(); });
  currentChain = chain;
  return chain;
}

function dbMock() {
  const dbFn = vi.fn().mockImplementation((_table: string) => currentChain);
  (dbFn as unknown as Record<string, unknown>).raw = (v: string) => v;
  (dbFn as unknown as Record<string, unknown>).fn = { now: () => new Date().toISOString() };
  return dbFn as never;
}

describe("SecurityEventCorrelationService", () => {
  let service: SecurityEventCorrelationService;

  beforeEach(() => {
    service = new SecurityEventCorrelationService();
    makeChain([makeCorrelationRow()]);
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("lists correlation views", async () => {
    const list = await service.listCorrelations();
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("Auth Failure Spike");
    expect(list[0].severity).toBe("high");
  });

  it("creates a new correlation view", async () => {
    makeChain([], makeCorrelationRow({ title: "New Rule" }));
    const created = await service.createCorrelation({
      title: "New Rule",
      severity: "medium",
      sourceSystems: ["gateway"],
    });
    expect(created.title).toBe("New Rule"); // mocked return
  });

  it("rejects correlation with empty title", async () => {
    await expect(service.createCorrelation({ title: "" })).rejects.toThrow("title is required");
  });

  it("updates correlation status", async () => {
    makeChain([makeCorrelationRow()], makeCorrelationRow({ status: "resolved" }));
    const updated = await service.updateCorrelationStatus("sec-c1", "resolved");
    expect(updated?.status).toBe("resolved");
  });

  it("ingests a security event", async () => {
    makeChain([], makeEventRow());
    const event = await service.ingestSecurityEvent({
      eventType: "invalid_token",
      source: "api-gateway",
      severity: "medium",
    });
    expect(event.eventType).toBe("auth_failure"); // mocked row
  });
});
