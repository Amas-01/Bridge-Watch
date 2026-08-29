import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { FastifyRequest } from "fastify";
import {
  estimateCost,
  resolveClientIp,
  resolvePrincipal,
  checkCostBudget,
  DEFAULT_BUDGET,
  TIER_BUDGETS,
  BUDGET_WINDOW_MS,
} from "../../src/api/middleware/costRateLimit.middleware.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    NODE_ENV: "test",
    RATE_LIMIT_ADMIN_API_KEY_PREFIX: "admin_",
    TRUSTED_PROXY_CIDRS: "10.0.0.0/8,172.16.0.0/12",
  },
}));

const mockEval = vi.fn();
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockIncrbyfloat = vi.fn();
const mockPexpire = vi.fn();

vi.mock("../../src/utils/redis.js", () => ({
  redis: {
    eval: (...args: unknown[]) => mockEval(...args),
    get: (...args: unknown[]) => mockGet(...args),
    set: (...args: unknown[]) => mockSet(...args),
    del: (...args: unknown[]) => mockDel(...args),
    incrbyfloat: (...args: unknown[]) => mockIncrbyfloat(...args),
    pexpire: (...args: unknown[]) => mockPexpire(...args),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<{
  ip: string;
  headers: Record<string, string>;
  method: string;
  url: string;
  query: Record<string, string>;
}>): FastifyRequest {
  return {
    ip: overrides.ip ?? "1.2.3.4",
    headers: overrides.headers ?? {},
    method: overrides.method ?? "GET",
    url: overrides.url ?? "/api/v1/assets",
    query: overrides.query ?? {},
  } as unknown as FastifyRequest;
}

// ---------------------------------------------------------------------------
// Suite: estimateCost
// ---------------------------------------------------------------------------

describe("estimateCost", () => {
  describe("base cost", () => {
    it("returns base cost of 1 for a plain GET request", () => {
      const { total, breakdown } = estimateCost("GET", "/api/v1/assets", {});
      expect(breakdown.base).toBe(1);
      expect(total).toBe(1);
    });

    it("returns base cost of 2 for POST requests", () => {
      const { breakdown } = estimateCost("POST", "/api/v1/alerts", {});
      expect(breakdown.base).toBe(2);
    });

    it("returns base cost of 2 for DELETE requests", () => {
      const { breakdown } = estimateCost("DELETE", "/api/v1/alerts/1", {});
      expect(breakdown.base).toBe(2);
    });

    it("returns base cost of 2 for PUT requests", () => {
      const { breakdown } = estimateCost("PUT", "/api/v1/config/1", {});
      expect(breakdown.base).toBe(2);
    });
  });

  describe("pagination cost", () => {
    it("adds no pagination cost when depth is within free threshold", () => {
      // page=1, limit=20 → depth=20, threshold=100
      const { breakdown } = estimateCost("GET", "/api/v1/assets", { page: 1, limit: 20 });
      expect(breakdown.pagination).toBe(0);
    });

    it("adds no pagination cost at exact free threshold boundary", () => {
      // page=5, limit=20 → depth=100
      const { breakdown } = estimateCost("GET", "/api/v1/assets", { page: 5, limit: 20 });
      expect(breakdown.pagination).toBe(0);
    });

    it("adds pagination cost for deep pages", () => {
      // page=10, limit=50 → depth=500, extra=400, cost=4
      const { breakdown } = estimateCost("GET", "/api/v1/assets", { page: 10, limit: 50 });
      expect(breakdown.pagination).toBe(4);
    });

    it("accepts string pagination params", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/assets", { page: "10", limit: "50" });
      expect(breakdown.pagination).toBe(4);
    });

    it("defaults page to 1 and limit to 20 when absent", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/assets", {});
      expect(breakdown.pagination).toBe(0);
    });
  });

  describe("date-range cost", () => {
    it("adds no cost when range is within free window", () => {
      const from = new Date("2024-01-01").toISOString();
      const to = new Date("2024-01-07").toISOString();
      const { breakdown } = estimateCost("GET", "/api/v1/prices", { from, to });
      expect(breakdown.dateRange).toBe(0);
    });

    it("adds cost for ranges exceeding 7 days", () => {
      // 37 days → 30 extra days → floor(30/30) = 1
      const from = new Date("2024-01-01").toISOString();
      const to = new Date("2024-02-07").toISOString();
      const { breakdown } = estimateCost("GET", "/api/v1/prices", { from, to });
      expect(breakdown.dateRange).toBe(1);
    });

    it("adds higher cost for very long date ranges", () => {
      // 97 days → 90 extra → floor(90/30) = 3
      const from = new Date("2024-01-01").toISOString();
      const to = new Date("2024-04-07").toISOString();
      const { breakdown } = estimateCost("GET", "/api/v1/prices", { from, to });
      expect(breakdown.dateRange).toBe(3);
    });

    it("adds no cost when only one date bound is provided", () => {
      const from = new Date("2024-01-01").toISOString();
      const { breakdown } = estimateCost("GET", "/api/v1/prices", { from });
      expect(breakdown.dateRange).toBe(0);
    });

    it("ignores unparseable date values gracefully", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/prices", { from: "bad", to: "date" });
      expect(breakdown.dateRange).toBe(0);
    });
  });

  describe("export cost", () => {
    it("adds export cost for /export path without format param", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/prices/export", {});
      expect(breakdown.export).toBe(3);
    });

    it("adds 5 for CSV export format", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/prices/export", { format: "csv" });
      expect(breakdown.export).toBe(5);
    });

    it("adds 8 for parquet export format", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/prices/export", { format: "parquet" });
      expect(breakdown.export).toBe(8);
    });

    it("adds 3 for JSON export format", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/prices/export", { format: "json" });
      expect(breakdown.export).toBe(3);
    });

    it("adds no export cost for normal read endpoints", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/assets", {});
      expect(breakdown.export).toBe(0);
    });
  });

  describe("join/aggregate cost", () => {
    it("adds join cost when join param is true", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/prices", { join: true });
      expect(breakdown.join).toBe(3);
    });

    it("adds join cost when join param is string 'true'", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/prices", { join: "true" });
      expect(breakdown.join).toBe(3);
    });

    it("adds join cost for /analytics path", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/analytics", {});
      expect(breakdown.join).toBe(3);
    });

    it("adds join cost for /aggregate path", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/prices/aggregate", {});
      expect(breakdown.join).toBe(3);
    });

    it("adds no join cost for plain reads", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/assets", {});
      expect(breakdown.join).toBe(0);
    });
  });

  describe("replay cost", () => {
    it("adds replay cost for /replay path", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/event-federation/replay", {});
      expect(breakdown.replay).toBeGreaterThanOrEqual(1);
    });

    it("adds replay cost proportional to replayWindow param", () => {
      // 3600 seconds = 6 × 600s → cost 6
      const { breakdown } = estimateCost("GET", "/api/v1/replay", { replayWindow: 3600 });
      expect(breakdown.replay).toBe(6);
    });

    it("defaults replay window to 600s (cost 1) when no param given", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/replay", {});
      expect(breakdown.replay).toBe(1);
    });

    it("adds no replay cost for non-replay endpoints", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/assets", {});
      expect(breakdown.replay).toBe(0);
    });
  });

  describe("batch cost", () => {
    it("adds batch cost for /batch path", () => {
      const { breakdown } = estimateCost("POST", "/api/v1/validate/batch", {});
      expect(breakdown.batch).toBeGreaterThanOrEqual(1);
    });

    it("adds batch cost proportional to batchSize param", () => {
      // batchSize=200 → floor(200/50) = 4
      const { breakdown } = estimateCost("POST", "/api/v1/prices", { batchSize: 200 });
      expect(breakdown.batch).toBe(4);
    });

    it("adds no batch cost for small batch sizes", () => {
      const { breakdown } = estimateCost("GET", "/api/v1/assets", { batchSize: 20 });
      expect(breakdown.batch).toBe(0);
    });
  });

  describe("combined cost", () => {
    it("accumulates all cost dimensions correctly", () => {
      const from = new Date("2024-01-01").toISOString();
      const to = new Date("2024-04-01").toISOString(); // 91 days
      const { total, breakdown } = estimateCost("GET", "/api/v1/prices/export", {
        page: 10,
        limit: 50,
        from,
        to,
        format: "csv",
        join: true,
      });
      expect(breakdown.base).toBe(1);
      expect(breakdown.pagination).toBe(4);  // (500-100)/100
      expect(breakdown.dateRange).toBeGreaterThan(0);
      expect(breakdown.export).toBe(5);
      expect(breakdown.join).toBe(3);
      expect(total).toBe(
        breakdown.base +
        breakdown.pagination +
        breakdown.dateRange +
        breakdown.export +
        breakdown.join +
        breakdown.replay +
        breakdown.batch,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Suite: resolveClientIp
// ---------------------------------------------------------------------------

describe("resolveClientIp", () => {
  it("returns direct IP when no trusted proxies are configured", () => {
    const req = makeRequest({
      ip: "1.2.3.4",
      headers: { "x-forwarded-for": "5.6.7.8" },
    });
    const ip = resolveClientIp(req, []);
    expect(ip).toBe("1.2.3.4");
  });

  it("returns direct IP when direct connection is not a trusted proxy", () => {
    const req = makeRequest({
      ip: "1.2.3.4",
      headers: { "x-forwarded-for": "5.6.7.8" },
    });
    const ip = resolveClientIp(req, ["10.0.0.0/8"]);
    expect(ip).toBe("1.2.3.4");
  });

  it("uses X-Forwarded-For client IP when direct IP is a trusted proxy", () => {
    const req = makeRequest({
      ip: "10.0.0.1",
      headers: { "x-forwarded-for": "5.6.7.8" },
    });
    const ip = resolveClientIp(req, ["10.0.0.0/8"]);
    expect(ip).toBe("5.6.7.8");
  });

  it("skips trusted proxy hops and finds first untrusted hop", () => {
    const req = makeRequest({
      ip: "10.0.0.1",
      headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.2, 10.0.0.3" },
    });
    const ip = resolveClientIp(req, ["10.0.0.0/8"]);
    expect(ip).toBe("5.6.7.8");
  });

  it("returns direct IP when X-Forwarded-For header is absent", () => {
    const req = makeRequest({ ip: "10.0.0.1", headers: {} });
    const ip = resolveClientIp(req, ["10.0.0.0/8"]);
    expect(ip).toBe("10.0.0.1");
  });

  it("prevents IP spoofing via forged X-Forwarded-For from untrusted source", () => {
    // Attacker sets X-Forwarded-For to a whitelisted IP, but their actual IP is not trusted
    const req = makeRequest({
      ip: "99.1.2.3",
      headers: { "x-forwarded-for": "127.0.0.1" },
    });
    const ip = resolveClientIp(req, ["10.0.0.0/8"]);
    expect(ip).toBe("99.1.2.3");
  });
});

// ---------------------------------------------------------------------------
// Suite: resolvePrincipal
// ---------------------------------------------------------------------------

describe("resolvePrincipal", () => {
  it("uses API key as principal when present", () => {
    const req = makeRequest({ headers: { "x-api-key": "basic_abc123" } });
    const principal = resolvePrincipal(req, "1.2.3.4");
    expect(principal.key).toBe("key:basic_abc123");
    expect(principal.isAnonymous).toBe(false);
  });

  it("uses resolved IP as principal when no API key is present", () => {
    const req = makeRequest({ headers: {} });
    const principal = resolvePrincipal(req, "5.6.7.8");
    expect(principal.key).toBe("ip:5.6.7.8");
    expect(principal.isAnonymous).toBe(true);
  });

  it("two requests from same API key but different IPs produce the same principal", () => {
    const req1 = makeRequest({ ip: "1.1.1.1", headers: { "x-api-key": "basic_key" } });
    const req2 = makeRequest({ ip: "2.2.2.2", headers: { "x-api-key": "basic_key" } });
    expect(resolvePrincipal(req1, "1.1.1.1").key).toBe(resolvePrincipal(req2, "2.2.2.2").key);
  });

  it("two requests from same IP but different API keys produce different principals", () => {
    const req1 = makeRequest({ ip: "1.1.1.1", headers: { "x-api-key": "basic_a" } });
    const req2 = makeRequest({ ip: "1.1.1.1", headers: { "x-api-key": "basic_b" } });
    expect(resolvePrincipal(req1, "1.1.1.1").key).not.toBe(resolvePrincipal(req2, "1.1.1.1").key);
  });
});

// ---------------------------------------------------------------------------
// Suite: TIER_BUDGETS
// ---------------------------------------------------------------------------

describe("TIER_BUDGETS", () => {
  it("free tier has the base budget", () => {
    expect(TIER_BUDGETS["free"]).toBe(DEFAULT_BUDGET);
  });

  it("basic tier has 3x free budget", () => {
    expect(TIER_BUDGETS["basic"]).toBe(DEFAULT_BUDGET * 3);
  });

  it("premium tier has 10x free budget", () => {
    expect(TIER_BUDGETS["premium"]).toBe(DEFAULT_BUDGET * 10);
  });

  it("trusted tier has infinite budget", () => {
    expect(TIER_BUDGETS["trusted"]).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// Suite: checkCostBudget
// ---------------------------------------------------------------------------

describe("checkCostBudget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // No existing debt by default
    mockGet.mockResolvedValue(null);
    mockSet.mockResolvedValue("OK");
    mockDel.mockResolvedValue(1);
    mockIncrbyfloat.mockResolvedValue(0);
    mockPexpire.mockResolvedValue(1);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockBudgetEval(allowed: 0 | 1, spent: number, budget: number, resetMs: number) {
    mockEval.mockResolvedValue([allowed, spent, budget, resetMs]);
  }

  it("allows a request within budget and returns correct remaining", async () => {
    const resetMs = Date.now() + BUDGET_WINDOW_MS;
    mockBudgetEval(1, 10, DEFAULT_BUDGET, resetMs);

    const result = await checkCostBudget("ip:1.2.3.4", 10, DEFAULT_BUDGET, BUDGET_WINDOW_MS);

    expect(result.allowed).toBe(true);
    expect(result.cost).toBe(10);
    expect(result.remaining).toBe(DEFAULT_BUDGET - 10);
    expect(result.budget).toBe(DEFAULT_BUDGET);
    expect(result.retryAfterMs).toBeUndefined();
    expect(result.degraded).toBeUndefined();
  });

  it("denies a request when budget is exhausted", async () => {
    const resetMs = Date.now() + BUDGET_WINDOW_MS;
    mockBudgetEval(0, DEFAULT_BUDGET, DEFAULT_BUDGET, resetMs);

    const result = await checkCostBudget("ip:1.2.3.4", 50, DEFAULT_BUDGET, BUDGET_WINDOW_MS);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("records debt when budget is exhausted", async () => {
    const resetMs = Date.now() + BUDGET_WINDOW_MS;
    mockBudgetEval(0, DEFAULT_BUDGET, DEFAULT_BUDGET, resetMs);

    await checkCostBudget("ip:1.2.3.4", 50, DEFAULT_BUDGET, BUDGET_WINDOW_MS);

    expect(mockIncrbyfloat).toHaveBeenCalledWith("bw:crl:debt:ip:1.2.3.4", 50);
  });

  it("does not record debt when request is allowed", async () => {
    const resetMs = Date.now() + BUDGET_WINDOW_MS;
    mockBudgetEval(1, 10, DEFAULT_BUDGET, resetMs);

    await checkCostBudget("ip:1.2.3.4", 10, DEFAULT_BUDGET, BUDGET_WINDOW_MS);

    expect(mockIncrbyfloat).not.toHaveBeenCalled();
  });

  it("fails open when Redis is unavailable (degraded mode)", async () => {
    mockGet.mockRejectedValue(new Error("Redis connection refused"));
    mockEval.mockRejectedValue(new Error("Redis connection refused"));

    const result = await checkCostBudget("ip:1.2.3.4", 10, DEFAULT_BUDGET, BUDGET_WINDOW_MS);

    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.remaining).toBe(DEFAULT_BUDGET);
  });

  it("applies debt-adjusted budget on subsequent windows", async () => {
    // Simulate existing debt of 300 units
    mockGet.mockResolvedValue("300");
    const resetMs = Date.now() + BUDGET_WINDOW_MS;
    mockBudgetEval(1, 10, DEFAULT_BUDGET * 0.5, resetMs);

    const result = await checkCostBudget("ip:1.2.3.4", 10, DEFAULT_BUDGET, BUDGET_WINDOW_MS);

    // The Lua eval was called with reduced budget
    const evalCall = mockEval.mock.calls[0];
    // ARGV[2] is the budget passed to Lua — should be reduced by up to 50%
    const budgetArg = Number(evalCall?.[4]);
    expect(budgetArg).toBeLessThanOrEqual(DEFAULT_BUDGET);
    expect(budgetArg).toBeGreaterThanOrEqual(DEFAULT_BUDGET * 0.5);
    expect(result.allowed).toBe(true);
  });

  it("decays debt by 50% each window", async () => {
    mockGet.mockResolvedValue("200");
    const resetMs = Date.now() + BUDGET_WINDOW_MS;
    mockBudgetEval(1, 10, DEFAULT_BUDGET, resetMs);

    await checkCostBudget("ip:1.2.3.4", 10, DEFAULT_BUDGET, BUDGET_WINDOW_MS);

    // Debt should be set to 50% of 200 = 100
    expect(mockSet).toHaveBeenCalledWith(
      "bw:crl:debt:ip:1.2.3.4",
      "100",
      expect.objectContaining({ PX: BUDGET_WINDOW_MS * 2 }),
    );
  });

  it("deletes debt key when decayed debt drops below 1", async () => {
    mockGet.mockResolvedValue("1");
    const resetMs = Date.now() + BUDGET_WINDOW_MS;
    mockBudgetEval(1, 10, DEFAULT_BUDGET, resetMs);

    await checkCostBudget("ip:1.2.3.4", 10, DEFAULT_BUDGET, BUDGET_WINDOW_MS);

    // 1 * 0.5 = 0.5 < 1 → should be deleted
    expect(mockDel).toHaveBeenCalledWith("bw:crl:debt:ip:1.2.3.4");
  });

  it("includes reset timestamp in response", async () => {
    const resetMs = Date.now() + 30_000;
    mockBudgetEval(1, 5, DEFAULT_BUDGET, resetMs);

    const result = await checkCostBudget("ip:1.2.3.4", 5, DEFAULT_BUDGET, BUDGET_WINDOW_MS);

    expect(result.resetMs).toBe(resetMs);
  });

  it("retryAfterMs is set and positive when denied", async () => {
    const resetMs = Date.now() + 45_000;
    mockBudgetEval(0, DEFAULT_BUDGET, DEFAULT_BUDGET, resetMs);

    const result = await checkCostBudget("ip:1.2.3.4", 50, DEFAULT_BUDGET, BUDGET_WINDOW_MS);

    expect(result.retryAfterMs).toBeDefined();
    expect(result.retryAfterMs!).toBeGreaterThan(0);
  });

  describe("contention: concurrent budget reservations", () => {
    it("uses atomic Redis Lua eval so concurrent calls do not double-count", async () => {
      const resetMs = Date.now() + BUDGET_WINDOW_MS;
      // Simulate two concurrent calls: both arrive, only one succeeds
      let callCount = 0;
      mockEval.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return [1, 10, DEFAULT_BUDGET, resetMs];
        return [0, DEFAULT_BUDGET, DEFAULT_BUDGET, resetMs]; // second denied
      });

      const [r1, r2] = await Promise.all([
        checkCostBudget("ip:1.2.3.4", 10, DEFAULT_BUDGET, BUDGET_WINDOW_MS),
        checkCostBudget("ip:1.2.3.4", DEFAULT_BUDGET, DEFAULT_BUDGET, BUDGET_WINDOW_MS),
      ]);

      // One should be allowed, one denied — budget was not double-spent
      const allowedCount = [r1, r2].filter((r) => r.allowed).length;
      expect(allowedCount).toBe(1);
    });
  });

  describe("Redis failover: bounded overload", () => {
    it("does not cascade failures — each request independently fails open", async () => {
      mockGet.mockResolvedValue(null);
      mockEval.mockRejectedValue(new Error("ECONNREFUSED"));

      const results = await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          checkCostBudget(`ip:1.2.3.${i}`, 10, DEFAULT_BUDGET, BUDGET_WINDOW_MS),
        ),
      );

      expect(results.every((r) => r.allowed)).toBe(true);
      expect(results.every((r) => r.degraded)).toBe(true);
    });

    it("returns graceful degraded result without throwing", async () => {
      mockGet.mockRejectedValue(new Error("timeout"));
      mockEval.mockRejectedValue(new Error("timeout"));

      await expect(
        checkCostBudget("ip:1.2.3.4", 10, DEFAULT_BUDGET, BUDGET_WINDOW_MS),
      ).resolves.toMatchObject({ allowed: true, degraded: true });
    });
  });
});
