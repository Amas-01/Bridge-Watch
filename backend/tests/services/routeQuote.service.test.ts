import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RouteQuoteService,
  QuoteExpiredError,
  QuoteNotFoundError,
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  type Quoter,
} from "../../src/services/routeQuote.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => mockDb),
}));

let quotes: Record<string, unknown>[] = [];
let nextId = 1;

/** In-memory stand-in for the `route_quotes` table. */
function table() {
  const predicates: ((row: Record<string, unknown>) => boolean)[] = [];

  const matches = (row: Record<string, unknown>) => predicates.every((p) => p(row));

  const builder: Record<string, unknown> = {
    where(arg: Record<string, unknown> | string, op?: unknown, value?: unknown) {
      if (typeof arg === "string" && value !== undefined) {
        predicates.push((row) => {
          const left = new Date(row[arg] as Date).getTime();
          const right = new Date(value as Date).getTime();
          return op === "<=" ? left <= right : left === right;
        });
      } else if (typeof arg === "string") {
        predicates.push((row) => row[arg] === op);
      } else {
        predicates.push((row) =>
          Object.entries(arg).every(([k, v]) => row[k] === v)
        );
      }
      return builder;
    },
    first: async () => quotes.find(matches) ?? undefined,
    insert(payload: Record<string, unknown>) {
      const row = { id: `q${nextId++}`, ...payload };
      quotes.push(row);
      return Object.assign(Promise.resolve([row]), { returning: async () => [row] });
    },
    update(changes: Record<string, unknown>) {
      const targets = quotes.filter(matches);
      for (const row of targets) Object.assign(row, changes);
      return Promise.resolve(targets.length);
    },
    orderBy: () => builder,
    limit: async () => quotes.filter(matches),
  };
  return builder;
}

const mockDb: any = () => table();

const quoter: Quoter = async (request) => ({
  route: [
    {
      poolId: "p1",
      dexName: "StellarX",
      assetIn: request.sourceAsset,
      assetOut: request.targetAsset,
      amountIn: request.inputAmount,
      amountOut: request.inputAmount * 0.997,
      fee: request.inputAmount * 0.003,
    },
  ],
  outputAmount: request.inputAmount * 0.997,
  priceImpactPct: 0.3,
});

const REQUEST = {
  ownerAddress: "GABC",
  sourceAsset: "USDC",
  targetAsset: "XLM",
  inputAmount: 1_000,
};

describe("RouteQuoteService (#1160)", () => {
  let service: RouteQuoteService;

  beforeEach(() => {
    quotes = [];
    nextId = 1;
    service = new RouteQuoteService(quoter);
    vi.clearAllMocks();
  });

  describe("issuing quotes", () => {
    it("stamps an expiry from the TTL", async () => {
      const quote = await service.createQuote({ ...REQUEST, ttlSeconds: 60 });

      expect(quote.ttlSeconds).toBe(60);
      expect(quote.expiresAt.getTime() - quote.quotedAt.getTime()).toBe(60_000);
      expect(quote.status).toBe("active");
      expect(quote.isExpired).toBe(false);
    });

    it("falls back to the default TTL when none is given", async () => {
      const quote = await service.createQuote(REQUEST);

      expect(quote.ttlSeconds).toBe(DEFAULT_TTL_SECONDS);
    });

    it("clamps an absurd TTL to the maximum", async () => {
      const quote = await service.createQuote({ ...REQUEST, ttlSeconds: 99_999 });

      expect(quote.ttlSeconds).toBe(MAX_TTL_SECONDS);
    });

    it("reports seconds remaining so a client can show a countdown", async () => {
      const quote = await service.createQuote({ ...REQUEST, ttlSeconds: 30 });

      expect(quote.secondsRemaining).toBeGreaterThan(25);
      expect(quote.secondsRemaining).toBeLessThanOrEqual(30);
    });
  });

  describe("expiration", () => {
    it("expires a stale quote lazily on read", async () => {
      const quote = await service.createQuote({ ...REQUEST, ttlSeconds: 30 });
      const later = new Date(quote.expiresAt.getTime() + 1_000);

      const read = await service.getQuote(quote.id, later);

      expect(read?.status).toBe("expired");
      expect(read?.isExpired).toBe(true);
      expect(read?.secondsRemaining).toBe(0);
      // The transition is persisted, not just computed for the response.
      expect(quotes[0].status).toBe("expired");
    });

    it("leaves a quote active while it is still inside its window", async () => {
      const quote = await service.createQuote({ ...REQUEST, ttlSeconds: 60 });
      const soon = new Date(quote.quotedAt.getTime() + 10_000);

      const read = await service.getQuote(quote.id, soon);

      expect(read?.status).toBe("active");
      expect(read?.secondsRemaining).toBe(50);
    });

    it("sweeps stale active quotes in bulk", async () => {
      const a = await service.createQuote({ ...REQUEST, ttlSeconds: 30 });
      await service.createQuote({ ...REQUEST, ttlSeconds: 300 });

      const expired = await service.expireStale(
        new Date(a.expiresAt.getTime() + 1_000)
      );

      expect(expired).toBe(1);
      expect(quotes.filter((q) => q.status === "expired")).toHaveLength(1);
    });

    it("returns null for an unknown quote rather than throwing", async () => {
      expect(await service.getQuote("nope")).toBeNull();
    });
  });

  describe("consuming", () => {
    it("marks a live quote consumed", async () => {
      const quote = await service.createQuote({ ...REQUEST, ttlSeconds: 60 });

      const consumed = await service.consumeQuote(quote.id);

      expect(consumed.status).toBe("consumed");
      expect(consumed.consumedAt).toBeInstanceOf(Date);
    });

    it("refuses a quote past its horizon", async () => {
      const quote = await service.createQuote({ ...REQUEST, ttlSeconds: 30 });
      const later = new Date(quote.expiresAt.getTime() + 1_000);

      await expect(service.consumeQuote(quote.id, later)).rejects.toBeInstanceOf(
        QuoteExpiredError
      );
      expect(quotes[0].status).toBe("expired");
    });

    it("refuses to consume the same quote twice", async () => {
      const quote = await service.createQuote({ ...REQUEST, ttlSeconds: 60 });
      await service.consumeQuote(quote.id);

      await expect(service.consumeQuote(quote.id)).rejects.toBeInstanceOf(
        QuoteExpiredError
      );
    });

    it("throws a distinct error for an unknown id", async () => {
      await expect(service.consumeQuote("nope")).rejects.toBeInstanceOf(
        QuoteNotFoundError
      );
    });
  });

  describe("refreshing", () => {
    it("re-prices an expired quote and links the two", async () => {
      const original = await service.createQuote({ ...REQUEST, ttlSeconds: 30 });
      const later = new Date(original.expiresAt.getTime() + 1_000);

      const refreshed = await service.refreshQuote(original.id, later);

      expect(refreshed.id).not.toBe(original.id);
      expect(refreshed.status).toBe("active");
      expect(refreshed.refreshedFrom).toBe(original.id);
      expect(refreshed.ttlSeconds).toBe(original.ttlSeconds);

      const old = quotes.find((q) => q.id === original.id);
      expect(old?.status).toBe("superseded");
      expect(old?.superseded_by).toBe(refreshed.id);
    });

    it("resolves a second refresh of the same quote to the live successor", async () => {
      const original = await service.createQuote({ ...REQUEST, ttlSeconds: 60 });
      const first = await service.refreshQuote(original.id);

      const second = await service.refreshQuote(original.id);

      expect(second.id).toBe(first.id);
      expect(quotes).toHaveLength(2);
    });

    it("will not refresh a quote that was already acted on", async () => {
      const quote = await service.createQuote({ ...REQUEST, ttlSeconds: 60 });
      await service.consumeQuote(quote.id);

      await expect(service.refreshQuote(quote.id)).rejects.toThrow(/consumed/);
    });

    it("throws for an unknown id", async () => {
      await expect(service.refreshQuote("nope")).rejects.toBeInstanceOf(
        QuoteNotFoundError
      );
    });
  });
});
