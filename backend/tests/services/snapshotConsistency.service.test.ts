import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SnapshotConsistencyService,
  WS_SEQUENCE_WATERMARK_KEY,
} from "../../src/services/snapshotConsistency.service.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockDbFirst = vi.fn();
const mockDbMax = vi.fn();
const mockDbChain = {
  max: () => mockDbChain,
  first: () => mockDbFirst(),
};
const mockDb = vi.fn(() => mockDbChain);

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockDb,
}));

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();

vi.mock("../../src/utils/redis.js", () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...args),
    set: (...args: unknown[]) => mockRedisSet(...args),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeService() {
  return new SnapshotConsistencyService(mockDb as unknown as import("knex").Knex);
}

// ---------------------------------------------------------------------------
// Suite: getDbSequenceWatermark
// ---------------------------------------------------------------------------

describe("getDbSequenceWatermark", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the max outbox_events id", async () => {
    mockDbFirst.mockResolvedValue({ max_id: "42" });
    const svc = makeService();
    const wm = await svc.getDbSequenceWatermark();
    expect(wm).toBe(42);
  });

  it("returns 0 when the table is empty (max_id = null)", async () => {
    mockDbFirst.mockResolvedValue({ max_id: null });
    const svc = makeService();
    expect(await svc.getDbSequenceWatermark()).toBe(0);
  });

  it("returns 0 when the query fails (fail-safe)", async () => {
    mockDbFirst.mockRejectedValue(new Error("DB down"));
    const svc = makeService();
    expect(await svc.getDbSequenceWatermark()).toBe(0);
  });

  it("coerces numeric max_id correctly", async () => {
    mockDbFirst.mockResolvedValue({ max_id: 999 });
    const svc = makeService();
    expect(await svc.getDbSequenceWatermark()).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// Suite: getWsSequenceWatermark
// ---------------------------------------------------------------------------

describe("getWsSequenceWatermark", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads from the correct Redis key", async () => {
    mockRedisGet.mockResolvedValue("100");
    const svc = makeService();
    await svc.getWsSequenceWatermark();
    expect(mockRedisGet).toHaveBeenCalledWith(WS_SEQUENCE_WATERMARK_KEY);
  });

  it("returns the stored sequence number", async () => {
    mockRedisGet.mockResolvedValue("77");
    const svc = makeService();
    expect(await svc.getWsSequenceWatermark()).toBe(77);
  });

  it("returns 0 when the key is absent (server not yet started)", async () => {
    mockRedisGet.mockResolvedValue(null);
    const svc = makeService();
    expect(await svc.getWsSequenceWatermark()).toBe(0);
  });

  it("returns 0 when Redis is unavailable", async () => {
    mockRedisGet.mockRejectedValue(new Error("ECONNREFUSED"));
    const svc = makeService();
    expect(await svc.getWsSequenceWatermark()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite: createSnapshotToken
// ---------------------------------------------------------------------------

describe("createSnapshotToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbFirst.mockResolvedValue({ max_id: "10" });
    mockRedisGet.mockResolvedValue("20");
  });

  it("returns a token with both watermarks", async () => {
    const svc = makeService();
    const token = await svc.createSnapshotToken();
    expect(token.watermark.dbSequence).toBe(10);
    expect(token.watermark.wsSequence).toBe(20);
  });

  it("encoded field is a non-empty base64url string", async () => {
    const svc = makeService();
    const token = await svc.createSnapshotToken();
    expect(typeof token.encoded).toBe("string");
    expect(token.encoded.length).toBeGreaterThan(0);
    // base64url must not contain +, /, or =
    expect(token.encoded).not.toMatch(/[+/=]/);
  });

  it("capturedAt is a valid ISO-8601 date string", async () => {
    const svc = makeService();
    const token = await svc.createSnapshotToken();
    expect(new Date(token.watermark.capturedAt).toISOString()).toBe(
      token.watermark.capturedAt,
    );
  });

  it("two consecutive tokens have monotonically non-decreasing wsSequence", async () => {
    mockRedisGet
      .mockResolvedValueOnce("5")
      .mockResolvedValueOnce("7");
    mockDbFirst.mockResolvedValue({ max_id: "1" });

    const svc = makeService();
    const t1 = await svc.createSnapshotToken();
    const t2 = await svc.createSnapshotToken();
    expect(t2.watermark.wsSequence).toBeGreaterThanOrEqual(t1.watermark.wsSequence);
  });
});

// ---------------------------------------------------------------------------
// Suite: parseSnapshotToken (round-trip)
// ---------------------------------------------------------------------------

describe("parseSnapshotToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbFirst.mockResolvedValue({ max_id: "5" });
    mockRedisGet.mockResolvedValue("15");
  });

  it("decodes the token produced by createSnapshotToken (round-trip)", async () => {
    const svc = makeService();
    const created = await svc.createSnapshotToken();
    const parsed = svc.parseSnapshotToken(created.encoded);

    expect(parsed).not.toBeNull();
    expect(parsed!.dbSequence).toBe(5);
    expect(parsed!.wsSequence).toBe(15);
  });

  it("returns null for undefined input", () => {
    const svc = makeService();
    expect(svc.parseSnapshotToken(undefined)).toBeNull();
  });

  it("returns null for a malformed token", () => {
    const svc = makeService();
    expect(svc.parseSnapshotToken("not-a-valid-token!!!")).toBeNull();
  });

  it("returns null for a token with a different version", () => {
    // Craft a v=99 token manually
    const payload = Buffer.from(JSON.stringify({ v: 99, db: 1, ws: 1, t: new Date().toISOString() })).toString("base64url");
    const svc = makeService();
    expect(svc.parseSnapshotToken(payload)).toBeNull();
  });

  it("returns null for an empty string", () => {
    const svc = makeService();
    expect(svc.parseSnapshotToken("")).toBeNull();
  });

  it("returns null for a token with missing required fields", () => {
    const payload = Buffer.from(JSON.stringify({ v: 1, db: 5 })).toString("base64url");
    const svc = makeService();
    expect(svc.parseSnapshotToken(payload)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: isCacheStale
// ---------------------------------------------------------------------------

describe("isCacheStale", () => {
  const svc = new SnapshotConsistencyService(mockDb as unknown as import("knex").Knex);

  it("returns false when cached sequence equals requested sequence", () => {
    expect(svc.isCacheStale(10, 10)).toBe(false);
  });

  it("returns false when cached sequence is ahead of requested", () => {
    expect(svc.isCacheStale(10, 12)).toBe(false);
  });

  it("returns false when cached sequence is within tolerance", () => {
    // STALE_TOLERANCE_SEQUENCES = 1; cached = requested - 1 → not stale
    expect(svc.isCacheStale(10, 9)).toBe(false);
  });

  it("returns true when cached sequence is more than 1 behind requested", () => {
    expect(svc.isCacheStale(10, 8)).toBe(true);
  });

  it("returns true for large staleness gap", () => {
    expect(svc.isCacheStale(100, 50)).toBe(true);
  });

  it("returns false when both sequences are 0 (no events yet)", () => {
    expect(svc.isCacheStale(0, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Suite: decideCatchUp
// ---------------------------------------------------------------------------

describe("decideCatchUp", () => {
  const svc = new SnapshotConsistencyService(mockDb as unknown as import("knex").Knex);

  it("allows replay when snapshot is within buffer range", () => {
    // buffer covers [5, 20]; snapshot = 10
    const result = svc.decideCatchUp(10, 5, 20);
    expect(result.canReplay).toBe(true);
    expect(result.sinceSequence).toBe(10);
    expect(result.reason).toBeUndefined();
  });

  it("allows replay when snapshot equals buffer low boundary", () => {
    const result = svc.decideCatchUp(5, 5, 20);
    expect(result.canReplay).toBe(true);
    expect(result.sinceSequence).toBe(5);
  });

  it("requires snapshot refresh when snapshot is before buffer low", () => {
    // buffer covers [10, 20]; snapshot = 5 → gap before buffer
    const result = svc.decideCatchUp(5, 10, 20);
    expect(result.canReplay).toBe(false);
    expect(result.reason).toBeDefined();
    expect(result.reason).toContain("10"); // bufferLow
    expect(result.reason).toContain("5");  // requested
  });

  it("requires snapshot refresh when snapshot is 0 and buffer has moved on", () => {
    const result = svc.decideCatchUp(0, 50, 100);
    expect(result.canReplay).toBe(false);
  });

  it("client already up-to-date when snapshot equals current high", () => {
    const result = svc.decideCatchUp(20, 5, 20);
    expect(result.canReplay).toBe(true);
    expect(result.sinceSequence).toBe(20);
  });

  it("client ahead of server — returns canReplay true, sinceSequence = high", () => {
    // Edge case: client somehow has a higher sequence than server (clock skew)
    const result = svc.decideCatchUp(30, 5, 20);
    expect(result.canReplay).toBe(true);
    expect(result.sinceSequence).toBe(20);
  });

  it("snapshot_required message includes human-readable reason", () => {
    const result = svc.decideCatchUp(1, 100, 200);
    expect(result.canReplay).toBe(false);
    expect(typeof result.reason).toBe("string");
    expect(result.reason!.length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------------------
// Suite: publishWsWatermark
// ---------------------------------------------------------------------------

describe("publishWsWatermark", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the WS sequence to Redis under the correct key with 5-minute TTL", async () => {
    mockRedisSet.mockResolvedValue("OK");
    const svc = makeService();
    await svc.publishWsWatermark(42);
    expect(mockRedisSet).toHaveBeenCalledWith(
      WS_SEQUENCE_WATERMARK_KEY,
      "42",
      { EX: 300 },
    );
  });

  it("does not throw when Redis is unavailable", async () => {
    mockRedisSet.mockRejectedValue(new Error("timeout"));
    const svc = makeService();
    await expect(svc.publishWsWatermark(1)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite: createDashboardSnapshotToken (cross-entity contract)
// ---------------------------------------------------------------------------

describe("createDashboardSnapshotToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbFirst.mockResolvedValue({ max_id: "30" });
    mockRedisGet.mockResolvedValue("60");
  });

  it("produces the same result as createSnapshotToken (shared watermark)", async () => {
    const svc = makeService();
    const [t1, t2] = await Promise.all([
      svc.createSnapshotToken(),
      svc.createDashboardSnapshotToken(),
    ]);
    // Both encode the same db+ws values; capturedAt may differ by a few ms
    expect(t1.watermark.dbSequence).toBe(t2.watermark.dbSequence);
    expect(t1.watermark.wsSequence).toBe(t2.watermark.wsSequence);
  });

  it("encoded token can be decoded back to the original watermark", async () => {
    const svc = makeService();
    const token = await svc.createDashboardSnapshotToken();
    const parsed = svc.parseSnapshotToken(token.encoded);
    expect(parsed?.dbSequence).toBe(30);
    expect(parsed?.wsSequence).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Suite: cross-entity consistency — one token covers all entity types
// ---------------------------------------------------------------------------

describe("cross-entity consistency contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbFirst.mockResolvedValue({ max_id: "100" });
    mockRedisGet.mockResolvedValue("200");
  });

  it("a single snapshot token is valid for staleness checks across all entity types", async () => {
    const svc = makeService();
    const token = await svc.createSnapshotToken();

    // Simulate a later cached read at sequence 199 for any entity
    const stale = svc.isCacheStale(token.watermark.wsSequence, 199);
    expect(typeof stale).toBe("boolean");
    // 200 - 199 = 1 which is within tolerance (STALE_TOLERANCE_SEQUENCES=1)
    expect(stale).toBe(false);

    // But a cache from sequence 198 would be stale
    const definitelyStale = svc.isCacheStale(token.watermark.wsSequence, 198);
    expect(definitelyStale).toBe(true);
  });

  it("catch-up decision uses the token's wsSequence as the replay boundary", async () => {
    const svc = makeService();
    const token = await svc.createSnapshotToken();
    const parsed = svc.parseSnapshotToken(token.encoded);

    // Buffer covers [150, 250]; snapshot was at 200
    const decision = svc.decideCatchUp(parsed!.wsSequence, 150, 250);
    expect(decision.canReplay).toBe(true);
    expect(decision.sinceSequence).toBe(200);
  });

  it("reconnect scenario: client re-subscribes with same token after disconnect", async () => {
    const svc = makeService();
    const token = await svc.createSnapshotToken();

    // After reconnect, wsHighWatermark has advanced to 250, buffer still at 150
    mockRedisGet.mockResolvedValue("250");
    const decision = svc.decideCatchUp(token.watermark.wsSequence, 150, 250);

    // Should be able to replay — the gap (200→250) is within buffer (150→250)
    expect(decision.canReplay).toBe(true);
    expect(decision.sinceSequence).toBe(token.watermark.wsSequence);
  });

  it("concurrent-update scenario: snapshot_required when buffer wrapped during outage", async () => {
    const svc = makeService();
    // Client had snapshot at wsSequence=50, but server buffer has wrapped to [500, 1000]
    const decision = svc.decideCatchUp(50, 500, 1000);
    expect(decision.canReplay).toBe(false);
    expect(decision.reason).toContain("500"); // bufferLow shown in reason
  });
});
