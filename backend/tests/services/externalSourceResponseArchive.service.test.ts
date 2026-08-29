import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  ExternalSourceResponseArchiveService,
  redactSecrets,
  classifyOutcome,
  hashBody,
  truncateBody,
  resolveExpiry,
} from "../../src/services/externalSourceResponseArchive.service.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/utils/metrics.js", () => ({
  getMetricsService: () => ({ recordCustomMetric: vi.fn() }),
}));

// ── Pure helpers ───────────────────────────────────────────────────────────

describe("redactSecrets", () => {
  it("redacts credential-looking keys at any depth", () => {
    const out = redactSecrets({
      apiKey: "abc",
      nested: { authorization: "Bearer xyz", value: 1 },
      list: [{ token: "t" }, { ok: true }],
    }) as any;
    expect(out.apiKey).toBe("[REDACTED]");
    expect(out.nested.authorization).toBe("[REDACTED]");
    expect(out.nested.value).toBe(1);
    expect(out.list[0].token).toBe("[REDACTED]");
    expect(out.list[1].ok).toBe(true);
  });

  it("redacts bearer tokens found in values", () => {
    const out = redactSecrets({ header: "bearer sk-123" }) as any;
    expect(out.header).toBe("[REDACTED]");
  });

  it("passes through primitives and stops at max depth", () => {
    expect(redactSecrets("plain")).toBe("plain");
    expect(redactSecrets(42)).toBe(42);
  });
});

describe("classifyOutcome", () => {
  it("maps status codes and transport errors", () => {
    expect(classifyOutcome({ statusCode: 200 })).toBe("ok");
    expect(classifyOutcome({ statusCode: 304 })).toBe("ok");
    expect(classifyOutcome({ statusCode: 404 })).toBe("client_error");
    expect(classifyOutcome({ statusCode: 503 })).toBe("server_error");
    expect(classifyOutcome({ errorKind: "timeout" })).toBe("timeout");
    expect(classifyOutcome({ errorKind: "transport" })).toBe("transport_error");
    expect(classifyOutcome({})).toBe("transport_error");
  });
});

describe("truncateBody", () => {
  it("keeps short bodies intact", () => {
    const r = truncateBody("hello", 1024);
    expect(r).toEqual({ stored: "hello", originalBytes: 5, truncated: false });
  });

  it("clips long bodies and reports the original size", () => {
    const body = "x".repeat(1000);
    const r = truncateBody(body, 100);
    expect(r.truncated).toBe(true);
    expect(r.stored.length).toBe(100);
    expect(r.originalBytes).toBe(1000);
  });

  it("does not split a multi-byte codepoint", () => {
    const body = "€".repeat(50); // 3 bytes each
    const r = truncateBody(body, 100);
    expect(r.truncated).toBe(true);
    // 100 is not a multiple of 3, so it must back off to 99 bytes -> 33 chars
    expect(Buffer.from(r.stored, "utf8").byteLength).toBe(99);
  });
});

describe("hashBody", () => {
  it("is stable and content-addressed", () => {
    expect(hashBody("a")).toBe(hashBody("a"));
    expect(hashBody("a")).not.toBe(hashBody("b"));
  });
});

describe("resolveExpiry", () => {
  const t0 = new Date("2026-01-01T00:00:00Z");

  it("uses the source default when unspecified", () => {
    expect(resolveExpiry(t0, undefined, 30)?.toISOString()).toBe(
      "2026-01-31T00:00:00.000Z"
    );
  });

  it("honours an explicit override", () => {
    expect(resolveExpiry(t0, 7, 30)?.toISOString()).toBe(
      "2026-01-08T00:00:00.000Z"
    );
  });

  it("treats null as a legal hold (no expiry)", () => {
    expect(resolveExpiry(t0, null, 30)).toBeNull();
  });
});

// ── Service against an in-memory fake knex ──────────────────────────────────

function makeFakeDb() {
  const rows: any[] = [];
  let seq = 0;

  function build(table: string) {
    const preds: Array<(r: any) => boolean> = [];
    let orderBys: Array<{ col: string; dir: string }> = [];
    let limitN: number | null = null;
    const state: any = {};

    const applied = () => {
      let out = rows.filter((r) => preds.every((p) => p(r)));
      for (const ob of [...orderBys].reverse()) {
        out = out.sort((a, b) => {
          const av = a[ob.col];
          const bv = b[ob.col];
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return ob.dir === "desc" ? -cmp : cmp;
        });
      }
      if (limitN != null) out = out.slice(0, limitN);
      return out;
    };

    const qb: any = {
      insert(data: any) {
        const row = {
          id: `resp-${++seq}`,
          ...data,
          request_params:
            typeof data.request_params === "string"
              ? JSON.parse(data.request_params)
              : data.request_params,
        };
        rows.push(row);
        return { returning: () => Promise.resolve([row]) };
      },
      where(a: any, op?: any, val?: any) {
        if (typeof a === "object") {
          preds.push((r) => Object.entries(a).every(([k, v]) => r[k] === v));
        } else if (op !== undefined && val !== undefined) {
          preds.push((r) => {
            const rv = r[a] instanceof Date ? r[a].getTime() : r[a];
            const cv = val instanceof Date ? val.getTime() : val;
            if (op === ">=") return rv >= cv;
            if (op === "<=") return rv <= cv;
            if (op === "<") return rv < cv;
            if (op === ">") return rv > cv;
            return rv === cv;
          });
        }
        return qb;
      },
      whereNotNull(col: string) {
        preds.push((r) => r[col] !== null && r[col] !== undefined);
        return qb;
      },
      whereIn(col: string, vals: any[]) {
        preds.push((r) => vals.includes(r[col]));
        return qb;
      },
      orderBy(col: string, dir = "asc") {
        orderBys.push({ col, dir });
        return qb;
      },
      limit(n: number) {
        limitN = n;
        return qb;
      },
      first() {
        return Promise.resolve(applied()[0]);
      },
      update(data: any) {
        const target = applied();
        for (const r of target) Object.assign(r, data);
        return { returning: () => Promise.resolve(target) };
      },
      delete() {
        const target = applied();
        for (const r of target) {
          const i = rows.indexOf(r);
          if (i >= 0) rows.splice(i, 1);
        }
        return Promise.resolve(target.length);
      },
      pluck(col: string) {
        return Promise.resolve(applied().map((r) => r[col]));
      },
      then(resolve: any, reject?: any) {
        return Promise.resolve(applied()).then(resolve, reject);
      },
    };
    void state;
    return qb;
  }

  const db: any = (table: string) => build(table);
  db.__rows = rows;
  return db;
}

describe("ExternalSourceResponseArchiveService", () => {
  let db: any;
  let service: ExternalSourceResponseArchiveService;

  beforeEach(() => {
    db = makeFakeDb();
    service = new ExternalSourceResponseArchiveService(db, {
      enabled: true,
      retentionDays: 30,
      maxBodyBytes: 50,
      pruneBatch: 100,
    });
  });

  it("archives a response, redacting secrets and hashing the full body", async () => {
    const rec = await service.record({
      sourceKey: "coingecko",
      endpoint: "simple/price",
      method: "get",
      requestParams: { ids: "stellar", api_key: "secret" },
      statusCode: 200,
      latencyMs: 42.6,
      responseBody: "y".repeat(120),
      contentType: "application/json",
      subject: "XLM",
      collectionRunId: "run-1",
    });

    expect(rec).not.toBeNull();
    expect(rec!.outcome).toBe("ok");
    expect(rec!.method).toBe("GET");
    expect(rec!.latencyMs).toBe(43);
    expect(rec!.requestParams).toEqual({ ids: "stellar", api_key: "[REDACTED]" });
    expect(rec!.bodyTruncated).toBe(true);
    expect(rec!.bodyBytes).toBe(120);
    expect(rec!.bodyHash).toBe(hashBody("y".repeat(120)));

    const full = await service.get(rec!.id);
    expect(full!.responseBody!.length).toBe(50);
  });

  it("returns null and never throws when archiving is disabled", async () => {
    const disabled = new ExternalSourceResponseArchiveService(db, {
      enabled: false,
      retentionDays: 30,
      maxBodyBytes: 50,
      pruneBatch: 100,
    });
    await expect(
      disabled.record({ sourceKey: "s", endpoint: "e" })
    ).resolves.toBeNull();
    expect(db.__rows.length).toBe(0);
  });

  it("swallows DB errors during record", async () => {
    const brokenDb: any = () => ({
      insert: () => ({
        returning: () => Promise.reject(new Error("db down")),
      }),
    });
    const s = new ExternalSourceResponseArchiveService(brokenDb, {
      enabled: true,
      retentionDays: 30,
      maxBodyBytes: 50,
      pruneBatch: 100,
    });
    await expect(s.record({ sourceKey: "s", endpoint: "e" })).resolves.toBeNull();
  });

  it("lists newest first with cursor paging", async () => {
    for (let i = 0; i < 3; i++) {
      await service.record({
        sourceKey: "circle",
        endpoint: "attestations",
        statusCode: 200,
        collectedAt: new Date(`2026-01-0${i + 1}T00:00:00Z`),
      });
    }
    const page1 = await service.list({ sourceKey: "circle", limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.items[0].collectedAt).toBe("2026-01-03T00:00:00.000Z");
    expect(page1.nextCursor).toBe("2026-01-02T00:00:00.000Z");

    const page2 = await service.list({
      sourceKey: "circle",
      limit: 2,
      cursor: page1.nextCursor!,
    });
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });

  it("filters by outcome", async () => {
    await service.record({ sourceKey: "s", endpoint: "e", statusCode: 200 });
    await service.record({ sourceKey: "s", endpoint: "e", statusCode: 500 });
    const failures = await service.list({ outcome: "server_error" });
    expect(failures.items).toHaveLength(1);
    expect(failures.items[0].statusCode).toBe(500);
  });

  it("prunes only responses past their expiry, sparing legal holds", async () => {
    const past = new Date(Date.now() - 40 * 864e5);
    await service.record({
      sourceKey: "s",
      endpoint: "e",
      statusCode: 200,
      collectedAt: past,
    }); // expires 30d after `past` -> already expired
    await service.record({ sourceKey: "s", endpoint: "e", statusCode: 200 }); // fresh
    const held = await service.record({
      sourceKey: "s",
      endpoint: "e",
      statusCode: 200,
      collectedAt: past,
      retentionDays: null, // legal hold
    });

    const deleted = await service.pruneExpired();
    expect(deleted).toBe(1);
    expect(await service.get(held!.id)).not.toBeNull();
  });

  it("setRetention applies a legal hold and can release it", async () => {
    const rec = await service.record({
      sourceKey: "s",
      endpoint: "e",
      statusCode: 200,
    });
    const held = await service.setRetention(rec!.id, null);
    expect(held!.expiresAt).toBeNull();

    const released = await service.setRetention(rec!.id, 10);
    expect(released!.expiresAt).not.toBeNull();
  });

  it("setRetention returns null for an unknown id", async () => {
    expect(await service.setRetention("nope", 10)).toBeNull();
  });
});
