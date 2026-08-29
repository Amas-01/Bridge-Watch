import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { ParseQuarantineQueueService } from "../../src/services/parseQuarantineQueue.service.js";

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
    id: "q1",
    source: "stellar-horizon",
    data_type: "transaction",
    raw_payload: JSON.stringify({ hash: "abc" }),
    parse_error: "missing field",
    error_code: "MISSING_FIELD",
    status: "quarantined",
    retry_count: 0,
    retry_history: JSON.stringify([]),
    priority: 5,
    reviewed_by: null,
    resolution_note: null,
    quarantined_at: new Date().toISOString(),
    reviewed_at: null,
    resolved_at: null,
    ...overrides,
  };
}

function makeTrx() {
  const trx: Record<string, unknown> = {};
  trx.where = vi.fn().mockReturnValue(trx);
  trx.first = vi.fn().mockResolvedValue(makeRow({ retry_count: 1 }));
  trx.update = vi.fn().mockResolvedValue([]);
  const trxFn = vi.fn().mockReturnValue(trx);
  trxFn.raw = (v: string) => ({ sql: v });
  return trxFn;
}

function makeChain(rows: unknown[] = [], updated?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.modify = vi.fn().mockImplementation((mod: (qb: unknown) => void) => {
    mod(chain);
    return chain;
  });
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(rows[0]);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(updated ? [updated] : rows.length ? [makeRow()] : []);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.raw = (v: string) => ({ sql: v });
  chain.then = vi.fn().mockImplementation((resolve) => { resolve(rows); return Promise.resolve(); });
  chain.transaction = vi.fn().mockImplementation(
    async (fn: (trx: unknown) => Promise<unknown>) => {
      return fn(makeTrx());
    }
  );
  currentChain = chain;
  return chain;
}

function dbMock() {
  const dbFn = vi.fn().mockImplementation((_table: string) => currentChain);
  (dbFn as unknown as Record<string, unknown>).raw = (v: string) => ({ sql: v });
  return dbFn as never;
}

describe("ParseQuarantineQueueService", () => {
  let service: ParseQuarantineQueueService;

  beforeEach(() => {
    service = new ParseQuarantineQueueService();
    makeChain([makeRow()], makeRow());
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("enqueues a quarantined record", async () => {
    makeChain([], makeRow());
    const record = await service.enqueue({
      source: "stellar-horizon",
      dataType: "transaction",
      rawPayload: { hash: "abc" },
      parseError: "missing field",
    });
    expect(record.status).toBe("quarantined");
    expect(record.source).toBe("stellar-horizon");
  });

  it("rejects an enqueue without a source", async () => {
    await expect(
      service.enqueue({ source: "", dataType: "tx", rawPayload: {}, parseError: "e" })
    ).rejects.toThrow("source");
  });

  it("lists quarantined records", async () => {
    const records = await service.list({ status: "quarantined" });
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe("q1");
  });

  it("returns null for an unknown record", async () => {
    makeChain([], undefined);
    const record = await service.get("missing");
    expect(record).toBeNull();
  });

  it("resolves a quarantined record", async () => {
    makeChain([makeRow()], makeRow({ status: "resolved" }));
    const record = await service.resolve("q1", "admin", "fixed manually");
    expect(record?.status).toBe("resolved");
  });

  it("rejects an invalid transition from disposed", async () => {
    makeChain([makeRow({ status: "disposed" })]);
    await expect(service.resolve("q1", "admin")).rejects.toThrow("cannot transition");
  });

  it("computes stats grouped by status and source", async () => {
    makeChain([
      { status: "quarantined", cnt: 3 },
      { status: "resolved", cnt: 1 },
    ]);
    const stats = await service.stats();
    expect(stats.byStatus.quarantined).toBe(3);
    expect(stats.byStatus.resolved).toBe(1);
    expect(stats.total).toBe(4);
  });

  it("returns null when retrying a resolved record", async () => {
    makeChain([makeRow({ status: "resolved" })], undefined);
    const record = await service.retry("q1", "admin");
    expect(record).toBeNull();
  });
});
