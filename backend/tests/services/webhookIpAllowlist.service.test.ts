import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { WebhookIpAllowlistService } from "../../src/services/webhookIpAllowlist.service.js";

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

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wl-1",
    webhook_endpoint_id: null,
    ip_or_cidr: "192.168.1.0/24",
    description: "Subnet 1",
    direction: "inbound",
    is_active: true,
    created_by: "admin",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeChain(rows: unknown[] = [], updated?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockImplementation(() => chain);
  chain.whereNull = vi.fn().mockReturnValue(chain);
  chain.orWhere = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(rows[0]);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.del = vi.fn().mockResolvedValue(1);
  chain.returning = vi.fn().mockResolvedValue([updated ?? rows[0] ?? makeRow()]);
  chain.then = vi.fn().mockImplementation((resolve) => { resolve(rows); return Promise.resolve(); });
  currentChain = chain;
  return chain;
}

function dbMock() {
  const dbFn = vi.fn().mockImplementation((_table: string) => currentChain);
  (dbFn as unknown as Record<string, unknown>).fn = { now: () => new Date().toISOString() };
  return dbFn as never;
}

describe("WebhookIpAllowlistService", () => {
  let service: WebhookIpAllowlistService;

  beforeEach(() => {
    service = new WebhookIpAllowlistService();
    makeChain([makeRow()]);
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("lists allowlist entries", async () => {
    const list = await service.listAllowlist();
    expect(list).toHaveLength(1);
    expect(list[0].ipOrCidr).toBe("192.168.1.0/24");
  });

  it("adds a new allowlist entry", async () => {
    makeChain([], makeRow({ ip_or_cidr: "10.0.0.1" }));
    const created = await service.addAllowlistEntry({
      ipOrCidr: "10.0.0.1",
      direction: "inbound",
    });
    expect(created.ipOrCidr).toBe("10.0.0.1");
  });

  it("rejects entry without IP/CIDR", async () => {
    await expect(service.addAllowlistEntry({ ipOrCidr: "" })).rejects.toThrow("ipOrCidr is required");
  });

  it("toggles entry status", async () => {
    makeChain([makeRow()], makeRow({ is_active: false }));
    const toggled = await service.toggleEntryStatus("wl-1", false);
    expect(toggled?.isActive).toBe(false);
  });

  it("deletes an entry", async () => {
    const deleted = await service.removeAllowlistEntry("wl-1");
    expect(deleted).toBe(true);
  });

  it("tests IP against allowlist matching CIDR", async () => {
    makeChain([makeRow({ ip_or_cidr: "192.168.1.0/24" })]);
    const res = await service.testIpAgainstAllowlist("192.168.1.50");
    expect(res.allowed).toBe(true);
    expect(res.matchingRule).toBeDefined();
  });

  it("tests IP against allowlist failing unmatched IP", async () => {
    makeChain([makeRow({ ip_or_cidr: "10.0.0.0/16" })]);
    const res = await service.testIpAgainstAllowlist("192.168.1.50");
    expect(res.allowed).toBe(false);
  });
});
