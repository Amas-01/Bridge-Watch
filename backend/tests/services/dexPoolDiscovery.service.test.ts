import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DexPoolDiscoveryService,
  type PoolSource,
} from "../../src/services/dexPoolDiscovery.service.js";
import type { LiquidityPool } from "../../src/services/pool.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => mockDb),
}));

/**
 * A minimal in-memory stand-in for the two discovery tables. Discovery is all
 * about which rows change across a refresh, so asserting against a real row
 * store says far more than asserting on knex call counts.
 */
let runs: Record<string, unknown>[] = [];
let registry: Record<string, unknown>[] = [];

function makeTable(rows: Record<string, unknown>[]) {
  let filters: Record<string, unknown> = {};
  const predicates: ((row: Record<string, unknown>) => boolean)[] = [];
  let updateCount = 0;

  const matches = (row: Record<string, unknown>) =>
    Object.entries(filters).every(([k, v]) => row[k] === v) &&
    predicates.every((p) => p(row));

  const builder: Record<string, unknown> = {
    where(arg: Record<string, unknown> | string, op?: unknown, value?: unknown) {
      if (typeof arg === "string" && value !== undefined) {
        predicates.push((row) =>
          op === "<"
            ? new Date(row[arg] as Date) < new Date(value as Date)
            : row[arg] === value
        );
      } else if (typeof arg === "string") {
        filters[arg] = op;
      } else {
        filters = { ...filters, ...arg };
      }
      return builder;
    },
    whereNotIn(column: string, values: unknown[]) {
      predicates.push((row) => !values.includes(row[column]));
      return builder;
    },
    first: async () => rows.find(matches) ?? undefined,
    insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
      const items = Array.isArray(payload) ? payload : [payload];
      const inserted = items.map((item, i) => ({
        id: `row-${rows.length + i + 1}`,
        ...item,
      }));
      rows.push(...inserted);
      return Object.assign(Promise.resolve(inserted), {
        returning: async () => inserted,
      });
    },
    update(changes: Record<string, unknown>) {
      const targets = rows.filter(matches);
      for (const row of targets) Object.assign(row, changes);
      updateCount = targets.length;
      return Object.assign(Promise.resolve(updateCount), {
        returning: async () => targets,
      });
    },
    orderBy: () => builder,
    limit: async () => rows.filter(matches),
  };
  return builder;
}

const mockDb: any = (table: string) =>
  makeTable(table === "dex_pool_discovery_runs" ? runs : registry);

const pool = (id: string, overrides: Partial<LiquidityPool> = {}): LiquidityPool => ({
  id,
  assetA: "USDC",
  assetB: "XLM",
  dex: "StellarX",
  totalLiquidity: 1_000_000,
  reserveA: 500_000,
  reserveB: 2_000_000,
  fee: 0.003,
  apr: 5,
  volume24h: 100_000,
  healthScore: 80,
  lastUpdated: new Date(),
  ...overrides,
});

const sourceOf = (pools: LiquidityPool[]): PoolSource => async () => pools;

describe("DexPoolDiscoveryService (#1157)", () => {
  beforeEach(() => {
    runs = [];
    registry = [];
    vi.clearAllMocks();
  });

  it("registers pools it has not seen before", async () => {
    const service = new DexPoolDiscoveryService(sourceOf([pool("p1"), pool("p2")]));

    const run = await service.refreshDex("StellarX");

    expect(run.status).toBe("completed");
    expect(run.poolsSeen).toBe(2);
    expect(run.poolsAdded).toBe(2);
    expect(run.poolsUpdated).toBe(0);
    expect(registry).toHaveLength(2);
  });

  it("updates a pool it has seen before rather than duplicating it", async () => {
    const service = new DexPoolDiscoveryService(sourceOf([pool("p1")]));
    await service.refreshDex("StellarX");

    const second = new DexPoolDiscoveryService(
      sourceOf([pool("p1", { totalLiquidity: 2_000_000 })])
    );
    const run = await second.refreshDex("StellarX");

    expect(run.poolsAdded).toBe(0);
    expect(run.poolsUpdated).toBe(1);
    expect(registry).toHaveLength(1);
    expect(registry[0].total_liquidity).toBe(2_000_000);
  });

  it("delists a pool the DEX stops reporting, without deleting it", async () => {
    await new DexPoolDiscoveryService(sourceOf([pool("p1"), pool("p2")])).refreshDex(
      "StellarX"
    );

    const run = await new DexPoolDiscoveryService(sourceOf([pool("p1")])).refreshDex(
      "StellarX"
    );

    expect(run.poolsDelisted).toBe(1);
    expect(registry).toHaveLength(2);
    const delisted = registry.find((r) => r.pool_key === "p2");
    expect(delisted?.status).toBe("delisted");
    expect(delisted?.delisted_at).toBeInstanceOf(Date);
  });

  it("reactivates a delisted pool when the DEX reports it again", async () => {
    await new DexPoolDiscoveryService(sourceOf([pool("p1")])).refreshDex("StellarX");
    await new DexPoolDiscoveryService(sourceOf([])).refreshDex("StellarX");
    expect(registry[0].status).toBe("delisted");

    await new DexPoolDiscoveryService(sourceOf([pool("p1")])).refreshDex("StellarX");

    expect(registry[0].status).toBe("active");
    expect(registry[0].delisted_at).toBeNull();
  });

  it("records an adapter failure as a failed run instead of throwing", async () => {
    const failing: PoolSource = async () => {
      throw new Error("adapter unreachable");
    };

    const run = await new DexPoolDiscoveryService(failing).refreshDex("Phoenix");

    expect(run.status).toBe("failed");
    expect(run.errorMessage).toBe("adapter unreachable");
  });

  it("keeps going across DEXes when one of them fails", async () => {
    const source: PoolSource = async (dex) => {
      if (dex === "Phoenix") throw new Error("down");
      return [pool("p1", { dex })];
    };

    const results = await new DexPoolDiscoveryService(source).refreshAll([
      "StellarX",
      "Phoenix",
      "Soroswap",
    ]);

    expect(results.map((r) => r.status)).toEqual(["completed", "failed", "completed"]);
  });
});
