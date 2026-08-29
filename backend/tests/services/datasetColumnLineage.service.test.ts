import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { DatasetColumnLineageService } from "../../src/services/datasetColumnLineage.service.js";

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

function makeTrx() {
  const trx: Record<string, unknown> = {};
  trx.where = vi.fn().mockReturnValue(trx);
  trx.insert = vi.fn().mockReturnValue(trx);
  trx.returning = vi.fn().mockResolvedValue([
    { id: "d1", name: "asset_prices", display_name: "Asset Prices", category: "prices", is_active: true },
  ]);
  trx.first = vi.fn().mockResolvedValue(undefined);
  const trxFn = vi.fn().mockReturnValue(trx);
  trx.raw = (v: string) => ({ sql: v });
  trxFn.raw = (v: string) => ({ sql: v });
  return trxFn;
}

function makeChain(rows: unknown[] = [], first?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.join = vi.fn().mockReturnValue(chain);
  chain.leftJoin = vi.fn().mockReturnValue(chain);
  chain.modify = vi.fn().mockImplementation((mod: (qb: unknown) => void) => {
    mod(chain);
    return chain;
  });
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.then = vi.fn().mockImplementation((resolve) => { resolve(rows); return Promise.resolve(); });
  chain.first = vi.fn().mockResolvedValue(first !== undefined ? first : rows[0]);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.count = vi.fn().mockReturnValue(chain);
  chain.raw = (v: string) => ({ sql: v });
  chain.transaction = vi
    .fn()
    .mockImplementation(async (fn: (trx: unknown) => Promise<unknown>) => {
      return fn(makeTrx());
    });
  currentChain = chain;
  return chain;
}

function dbMock() {
  const dbFn = vi.fn().mockImplementation((_table: string) => currentChain);
  (dbFn as unknown as Record<string, unknown>).transaction = (
    currentChain.transaction as unknown
  );
  (dbFn as unknown as Record<string, unknown>).raw = (v: string) => ({ sql: v });
  return dbFn as never;
}

describe("DatasetColumnLineageService", () => {
  let service: DatasetColumnLineageService;

  beforeEach(() => {
    service = new DatasetColumnLineageService();
    makeChain();
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("lists datasets and maps column counts", async () => {
    makeChain([
      {
        id: "d1",
        name: "asset_prices",
        display_name: "Asset Prices",
        description: null,
        category: "prices",
        is_active: true,
        column_count: 4,
      },
    ]);

    const datasets = await service.listDatasets();
    expect(datasets).toHaveLength(1);
    expect(datasets[0].name).toBe("asset_prices");
    expect(datasets[0].columnCount).toBe(4);
  });

  it("returns null when getDataset finds nothing", async () => {
    makeChain([], undefined);
    const dataset = await service.getDataset("missing");
    expect(dataset).toBeNull();
  });

  it("maps columns correctly", async () => {
    makeChain([
      {
        id: "c1",
        dataset_id: "d1",
        name: "symbol",
        data_type: "text",
        description: null,
        is_primary_key: true,
        position: 0,
      },
    ]);

    const columns = await service.listColumns("d1");
    expect(columns[0].name).toBe("symbol");
    expect(columns[0].isPrimaryKey).toBe(true);
  });

  it("returns null for an unknown column lineage", async () => {
    makeChain([], undefined);
    const view = await service.getColumnLineage("d1", "missing");
    expect(view).toBeNull();
  });

  it("creates a dataset via transaction", async () => {
    makeChain([], { id: "d1", name: "x", display_name: "X", category: "cat", is_active: true });
    const created = await service.createDataset({
      name: "asset_prices",
      displayName: "Asset Prices",
      columns: [{ name: "symbol", isPrimaryKey: true }],
    });
    expect(created.id).toBe("d1");
  });
});
