import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  AlertEffectGuard,
  buildEffectKey,
  type AlertDeliveryChannel,
  type EffectStatus,
} from "../../src/services/alertEffectGuard.service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockDb,
}));

// ---------------------------------------------------------------------------
// In-memory DB stub
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

let store: Map<string, Row>;

function nextId() {
  return `uuid-${Math.random().toString(36).slice(2)}`;
}

function makeChain(rows: Row[]): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const chainFns = [
    "where", "whereIn", "whereNotNull", "andWhere", "orderBy",
    "limit", "select", "groupBy",
  ];

  // Terminal
  chain.first = vi.fn().mockResolvedValue(rows[0] ?? null);
  chain.update = vi.fn().mockResolvedValue(0);
  chain.insert = vi.fn().mockResolvedValue([1]);
  chain.count = vi.fn().mockReturnValue(chain);

  for (const fn of chainFns) {
    chain[fn] = vi.fn().mockReturnValue(chain);
  }

  return chain;
}

// The mock DB builder — rewired per test via resetStore / overrideDb
let dbTableOverride: Map<string, ReturnType<typeof makeChain>> = new Map();

const mockRaw = vi.fn((sql: string) => ({ toQuery: () => sql }));

const mockDb: Record<string, unknown> = {};
// Assign later per test

// ---------------------------------------------------------------------------
// Better approach: use a real in-memory store with controlled fakes
// ---------------------------------------------------------------------------

function createFakeDb() {
  store = new Map<string, Row>();

  const dbInsertFn = (tableName: string) => {
    return {
      insert(rows: Row | Row[]) {
        const arr = Array.isArray(rows) ? rows : [rows];
        return {
          onConflict(col: string) {
            return {
              ignore() {
                // ON CONFLICT DO NOTHING: only insert if key doesn't exist
                for (const row of arr) {
                  const key = row[col] as string;
                  if (!store.has(key)) {
                    store.set(key, { ...row, id: nextId() });
                  }
                }
                return Promise.resolve([arr.length]);
              },
            };
          },
          then(resolve: Function) {
            for (const row of arr) {
              const key = nextId();
              store.set(key, { ...row, id: key });
            }
            return Promise.resolve([1]).then(resolve);
          },
        };
      },
    };
  };

  function where(field: string | Record<string, unknown>, value?: unknown) {
    return {
      _filters: typeof field === "object" ? field : { [field]: value },

      where(f2: string | Record<string, unknown>, v2?: unknown) {
        const extra = typeof f2 === "object" ? f2 : { [f2]: v2 };
        this._filters = { ...this._filters, ...extra };
        return this;
      },

      whereIn(col: string, vals: unknown[]) {
        this._filters = { ...this._filters, [`__in_${col}`]: vals };
        return this;
      },

      update(patch: Record<string, unknown>) {
        let count = 0;
        for (const [k, row] of store) {
          if (matchesFilters(row, this._filters)) {
            store.set(k, { ...row, ...patch });
            count++;
          }
        }
        return Promise.resolve(count);
      },

      first() {
        for (const row of store.values()) {
          if (matchesFilters(row, this._filters)) return Promise.resolve(row);
        }
        return Promise.resolve(null);
      },

      select(_cols?: string) {
        return this;
      },

      count(_col: string) {
        return this;
      },

      groupBy(..._cols: string[]) {
        // Return aggregated result
        const counts: Record<string, Record<string, number>> = {};
        for (const row of store.values()) {
          if (matchesFilters(row, this._filters)) {
            const status = row.status as string;
            const channel = row.channel as string;
            const key = `${status}:${channel}`;
            counts[key] = counts[key] ?? { status, channel, count: 0 };
            counts[key].count!++;
          }
        }
        return Promise.resolve(Object.values(counts));
      },

      orderBy(_col: string, _dir?: string) {
        return this;
      },

      // Thenable — for select("*") calls
      then(resolve: Function) {
        const rows = [...store.values()].filter((r) =>
          matchesFilters(r, this._filters),
        );
        return Promise.resolve(rows).then(resolve);
      },
    };
  }

  function matchesFilters(row: Row, filters: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(filters)) {
      if (k.startsWith("__in_")) {
        const col = k.slice(5);
        if (!(v as unknown[]).includes(row[col])) return false;
      } else if (row[k] !== v) {
        return false;
      }
    }
    return true;
  }

  const fakeDb = (table: string) => {
    const tableStore = store;
    return {
      insert(rows: Row | Row[]) {
        const arr = Array.isArray(rows) ? rows : [rows];
        return {
          onConflict(col: string) {
            return {
              ignore() {
                for (const row of arr) {
                  const key = row[col] as string;
                  if (!tableStore.has(key)) {
                    tableStore.set(key, { ...row, id: nextId() });
                  }
                }
                return Promise.resolve([arr.length]);
              },
            };
          },
        };
      },
      where(field: string | Record<string, unknown>, value?: unknown) {
        return where(field, value);
      },
      select(_cols?: string) {
        return {
          count(_c: string) { return this; },
          groupBy(..._cols: string[]) {
            const counts: Record<string, Record<string, unknown>> = {};
            for (const row of tableStore.values()) {
              const status = row.status as string;
              const channel = row.channel as string;
              const key = `${status}:${channel}`;
              if (!counts[key]) counts[key] = { status, channel, count: 0 };
              (counts[key].count as number)++;
            }
            return Promise.resolve(Object.values(counts));
          },
          where(_f: unknown, _v?: unknown) { return this; },
          orderBy(_c: string, _d?: string) { return this; },
          then(resolve: Function) {
            return Promise.resolve([...tableStore.values()]).then(resolve);
          },
        };
      },
      raw(sql: string) { return sql; },
    };
  };

  // Attach the raw method
  (fakeDb as Record<string, unknown>).raw = mockRaw;

  return fakeDb as unknown as import("knex").Knex;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildEffectKey", () => {
  it("produces a stable deterministic key from event id and channel", () => {
    expect(buildEffectKey(42, "email")).toBe("42:email");
    expect(buildEffectKey("99", "webhook")).toBe("99:webhook");
  });

  it("different channels produce different keys for the same event", () => {
    expect(buildEffectKey(1, "email")).not.toBe(buildEffectKey(1, "slack"));
  });

  it("same channel on different events produces different keys", () => {
    expect(buildEffectKey(1, "email")).not.toBe(buildEffectKey(2, "email"));
  });
});

// ---------------------------------------------------------------------------
// Suite: claimEffect
// ---------------------------------------------------------------------------

describe("claimEffect", () => {
  let guard: AlertEffectGuard;

  beforeEach(() => {
    const db = createFakeDb();
    guard = new AlertEffectGuard(db);
  });

  it("AC-1: first claim succeeds and returns claimed=true, isDuplicate=false", async () => {
    const result = await guard.claimEffect(1, "email", "worker-A");
    expect(result.claimed).toBe(true);
    expect(result.isDuplicate).toBe(false);
    expect(result.record.status).toBe("pending");
    expect(result.record.claimedBy).toBe("worker-A");
  });

  it("AC-1: second claim on same effect_key returns claimed=false, isDuplicate=true", async () => {
    await guard.claimEffect(1, "email", "worker-A");
    const second = await guard.claimEffect(1, "email", "worker-B");
    expect(second.claimed).toBe(false);
    expect(second.isDuplicate).toBe(true);
  });

  it("AC-1: two different channels on the same event can both be claimed", async () => {
    const r1 = await guard.claimEffect(1, "email", "worker-A");
    const r2 = await guard.claimEffect(1, "slack", "worker-B");
    expect(r1.claimed).toBe(true);
    expect(r2.claimed).toBe(true);
  });

  it("sets lease_expires_at in the future", async () => {
    const before = Date.now();
    const result = await guard.claimEffect(1, "email", "worker-A", 30_000);
    expect(result.record.leaseExpiresAt).not.toBeNull();
    expect(result.record.leaseExpiresAt!.getTime()).toBeGreaterThan(before);
  });

  it("stores the outbox event id and channel on the record", async () => {
    const result = await guard.claimEffect(7, "webhook", "worker-X");
    expect(result.record.outboxEventId).toBe(7);
    expect(result.record.channel).toBe("webhook");
  });

  it("concurrent claims: only one worker wins (ON CONFLICT DO NOTHING semantics)", async () => {
    const results = await Promise.all([
      guard.claimEffect(5, "email", "worker-1"),
      guard.claimEffect(5, "email", "worker-2"),
      guard.claimEffect(5, "email", "worker-3"),
    ]);
    const winners = results.filter((r) => r.claimed);
    expect(winners.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Suite: commitEffect
// ---------------------------------------------------------------------------

describe("commitEffect", () => {
  let guard: AlertEffectGuard;

  beforeEach(() => {
    const db = createFakeDb();
    guard = new AlertEffectGuard(db);
  });

  it("AC-2: committing a claimed effect sets status to delivered", async () => {
    await guard.claimEffect(1, "email", "worker-A");
    const ok = await guard.commitEffect(1, "email", "worker-A");
    expect(ok).toBe(true);

    const effects = await guard.getEffectsForEvent(1);
    const record = effects.find((e) => e.channel === "email");
    expect(record?.status).toBe("delivered");
    expect(record?.deliveredAt).not.toBeNull();
  });

  it("AC-2: commit by wrong worker returns false (lease ownership check)", async () => {
    await guard.claimEffect(1, "email", "worker-A");
    const ok = await guard.commitEffect(1, "email", "worker-THIEF");
    expect(ok).toBe(false);
  });

  it("AC-2: committing already-delivered effect returns false", async () => {
    await guard.claimEffect(1, "email", "worker-A");
    await guard.commitEffect(1, "email", "worker-A");
    const second = await guard.commitEffect(1, "email", "worker-A");
    expect(second).toBe(false);
  });

  it("one alert transition produces exactly one delivered record per channel", async () => {
    const channels: AlertDeliveryChannel[] = ["email", "slack", "webhook"];
    for (const ch of channels) {
      await guard.claimEffect(10, ch, "worker-A");
      await guard.commitEffect(10, ch, "worker-A");
    }
    const effects = await guard.getEffectsForEvent(10);
    const delivered = effects.filter((e) => e.status === "delivered");
    expect(delivered.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Suite: markAmbiguous
// ---------------------------------------------------------------------------

describe("markAmbiguous", () => {
  let guard: AlertEffectGuard;

  beforeEach(() => {
    const db = createFakeDb();
    guard = new AlertEffectGuard(db);
  });

  it("AC-4: ambiguous effects remain visible with the reason message", async () => {
    await guard.claimEffect(2, "webhook", "worker-A");
    const ok = await guard.markAmbiguous(2, "webhook", "worker-A", "5xx timeout — delivery uncertain");
    expect(ok).toBe(true);

    const ambiguous = await guard.listAmbiguous();
    expect(ambiguous.length).toBe(1);
    expect(ambiguous[0]!.errorMessage).toContain("5xx timeout");
    expect(ambiguous[0]!.status).toBe("ambiguous");
  });

  it("markAmbiguous by wrong worker returns false", async () => {
    await guard.claimEffect(2, "webhook", "worker-A");
    const ok = await guard.markAmbiguous(2, "webhook", "worker-THIEF", "spoof");
    expect(ok).toBe(false);
  });

  it("ambiguous record is NOT automatically retried (status stays ambiguous)", async () => {
    await guard.claimEffect(2, "webhook", "worker-A");
    await guard.markAmbiguous(2, "webhook", "worker-A", "network split");

    // Reclaiming should not touch ambiguous records
    const reclaimed = await guard.reclaimExpiredLeases("worker-B", 30_000);
    expect(reclaimed).toBe(0);

    const ambiguous = await guard.listAmbiguous();
    expect(ambiguous.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Suite: reclaimExpiredLeases
// ---------------------------------------------------------------------------

describe("reclaimExpiredLeases", () => {
  let guard: AlertEffectGuard;

  beforeEach(() => {
    const db = createFakeDb();
    guard = new AlertEffectGuard(db);
  });

  it("AC-2 crash recovery: expired pending claims are reclaimed by new worker", async () => {
    // Use 1ms lease so it expires immediately
    await guard.claimEffect(3, "email", "dead-worker", 1);

    // Wait to ensure lease expired
    await new Promise((r) => setTimeout(r, 5));

    const count = await guard.reclaimExpiredLeases("recovery-worker");
    expect(count).toBeGreaterThanOrEqual(1);

    const effects = await guard.getEffectsForEvent(3);
    const record = effects.find((e) => e.channel === "email");
    expect(record?.claimedBy).toBe("recovery-worker");
  });

  it("active leases (not expired) are not reclaimed", async () => {
    await guard.claimEffect(4, "email", "worker-A", 60_000); // 60s lease
    const count = await guard.reclaimExpiredLeases("recovery-worker");
    expect(count).toBe(0);
  });

  it("delivered records are never reclaimed", async () => {
    await guard.claimEffect(5, "email", "worker-A", 1);
    await guard.commitEffect(5, "email", "worker-A");
    await new Promise((r) => setTimeout(r, 5));

    const count = await guard.reclaimExpiredLeases("recovery-worker");
    expect(count).toBe(0);
  });

  it("increments attempt_count on reclaim", async () => {
    await guard.claimEffect(6, "slack", "dead-worker", 1);
    await new Promise((r) => setTimeout(r, 5));
    await guard.reclaimExpiredLeases("recovery-worker");

    const effects = await guard.getEffectsForEvent(6);
    const record = effects.find((e) => e.channel === "slack");
    expect(record?.attemptCount).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Suite: recordDuplicateSuppression
// ---------------------------------------------------------------------------

describe("recordDuplicateSuppression", () => {
  let guard: AlertEffectGuard;

  beforeEach(() => {
    const db = createFakeDb();
    guard = new AlertEffectGuard(db);
  });

  it("AC-3 and AC-4: manual retry records a duplicate_suppressed audit row", async () => {
    await guard.claimEffect(7, "email", "worker-A");
    await guard.commitEffect(7, "email", "worker-A");

    // Manual retry attempt
    await guard.recordDuplicateSuppression(7, "email", "operator-replay", "manual retry #1");

    const metrics = await guard.getEffectMetrics();
    expect(metrics.duplicateSuppressed).toBeGreaterThanOrEqual(1);
  });

  it("multiple suppression records do not collide with each other", async () => {
    await guard.recordDuplicateSuppression(8, "email", "op-1", "retry 1");
    await guard.recordDuplicateSuppression(8, "email", "op-2", "retry 2");
    // Both inserts succeed without PK/unique conflicts
    const metrics = await guard.getEffectMetrics();
    expect(metrics.duplicateSuppressed).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// Suite: getEffectMetrics
// ---------------------------------------------------------------------------

describe("getEffectMetrics", () => {
  let guard: AlertEffectGuard;

  beforeEach(() => {
    const db = createFakeDb();
    guard = new AlertEffectGuard(db);
  });

  it("AC-5: metrics start at zero", async () => {
    const m = await guard.getEffectMetrics();
    expect(m.pending).toBe(0);
    expect(m.delivered).toBe(0);
    expect(m.ambiguous).toBe(0);
    expect(m.duplicateSuppressed).toBe(0);
    expect(m.total).toBe(0);
  });

  it("AC-5: pending count reflects uncompleted claims", async () => {
    await guard.claimEffect(10, "email", "worker-A");
    await guard.claimEffect(11, "email", "worker-B");
    const m = await guard.getEffectMetrics();
    expect(m.pending).toBeGreaterThanOrEqual(2);
  });

  it("AC-5: delivered count reflects committed effects", async () => {
    await guard.claimEffect(20, "email", "worker-A");
    await guard.commitEffect(20, "email", "worker-A");
    const m = await guard.getEffectMetrics();
    expect(m.delivered).toBeGreaterThanOrEqual(1);
  });

  it("AC-5: ambiguous count reflects ambiguous effects", async () => {
    await guard.claimEffect(30, "webhook", "worker-A");
    await guard.markAmbiguous(30, "webhook", "worker-A", "timeout");
    const m = await guard.getEffectMetrics();
    expect(m.ambiguous).toBeGreaterThanOrEqual(1);
  });

  it("AC-5: byChannel breakdown matches per-channel counts", async () => {
    await guard.claimEffect(40, "email", "worker-A");
    await guard.commitEffect(40, "email", "worker-A");
    await guard.claimEffect(41, "slack", "worker-B");
    await guard.markAmbiguous(41, "slack", "worker-B", "timeout");

    const m = await guard.getEffectMetrics();
    expect(m.byChannel["email"]?.delivered).toBeGreaterThanOrEqual(1);
    expect(m.byChannel["slack"]?.ambiguous).toBeGreaterThanOrEqual(1);
  });

  it("AC-5: total equals sum of all status counts", async () => {
    await guard.claimEffect(50, "email", "worker-A");
    await guard.claimEffect(51, "webhook", "worker-B");
    await guard.commitEffect(50, "email", "worker-A");

    const m = await guard.getEffectMetrics();
    expect(m.total).toBe(m.pending + m.delivered + m.ambiguous + m.duplicateSuppressed);
  });
});

// ---------------------------------------------------------------------------
// Suite: transaction boundary crash-convergence (AC-2)
// ---------------------------------------------------------------------------

describe("crash-injection: transaction boundary convergence", () => {
  it("crash after claim and before commit: reclaim converges to one delivery", async () => {
    const db = createFakeDb();
    const guard = new AlertEffectGuard(db);

    // Worker-A claims then crashes (no commit)
    await guard.claimEffect(100, "email", "dead-worker-A", 1);
    await new Promise((r) => setTimeout(r, 5)); // lease expires

    // Recovery worker reclaims
    await guard.reclaimExpiredLeases("recovery-worker");

    // Recovery worker claims (post-reclaim the record is now owned by recovery-worker)
    // In real usage the recovery worker re-claims via claimEffect after reclaimExpiredLeases
    // sets claimed_by to recovery-worker's id. Here we commit directly.
    await guard.commitEffect(100, "email", "recovery-worker");

    const effects = await guard.getEffectsForEvent(100);
    const delivered = effects.filter((e) => e.status === "delivered" && e.channel === "email");
    expect(delivered.length).toBe(1);
  });

  it("crash after commit: idempotency prevents double delivery on retry", async () => {
    const db = createFakeDb();
    const guard = new AlertEffectGuard(db);

    // First successful delivery
    await guard.claimEffect(200, "email", "worker-A");
    await guard.commitEffect(200, "email", "worker-A");

    // Retry from a different worker (e.g. queue re-delivery)
    const secondClaim = await guard.claimEffect(200, "email", "worker-B");
    expect(secondClaim.claimed).toBe(false);
    expect(secondClaim.isDuplicate).toBe(true);

    // Confirm still exactly one delivered record
    const effects = await guard.getEffectsForEvent(200);
    const delivered = effects.filter((e) => e.status === "delivered" && e.channel === "email");
    expect(delivered.length).toBe(1);
  });

  it("replay cannot create duplicate external notification (replays are duplicate-suppressed)", async () => {
    const db = createFakeDb();
    const guard = new AlertEffectGuard(db);

    await guard.claimEffect(300, "webhook", "worker-A");
    await guard.commitEffect(300, "webhook", "worker-A");

    // Manual replay by operator
    const replayClaim = await guard.claimEffect(300, "webhook", "replay-worker");
    expect(replayClaim.claimed).toBe(false);

    await guard.recordDuplicateSuppression(300, "webhook", "replay-worker", "operator replay suppressed");

    const metrics = await guard.getEffectMetrics();
    expect(metrics.duplicateSuppressed).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Suite: getEffectsForEvent and listAmbiguous
// ---------------------------------------------------------------------------

describe("read helpers", () => {
  let guard: AlertEffectGuard;

  beforeEach(() => {
    const db = createFakeDb();
    guard = new AlertEffectGuard(db);
  });

  it("getEffectsForEvent returns all channels for an event", async () => {
    await guard.claimEffect(400, "email", "w1");
    await guard.claimEffect(400, "slack", "w2");
    await guard.claimEffect(400, "webhook", "w3");

    const effects = await guard.getEffectsForEvent(400);
    const channels = effects.map((e) => e.channel).sort();
    expect(channels).toEqual(["email", "slack", "webhook"]);
  });

  it("listAmbiguous returns only ambiguous records", async () => {
    await guard.claimEffect(500, "email", "w1");
    await guard.commitEffect(500, "email", "w1");
    await guard.claimEffect(501, "webhook", "w2");
    await guard.markAmbiguous(501, "webhook", "w2", "split brain");

    const ambiguous = await guard.listAmbiguous();
    expect(ambiguous.every((r) => r.status === "ambiguous")).toBe(true);
    expect(ambiguous.length).toBeGreaterThanOrEqual(1);
  });
});
