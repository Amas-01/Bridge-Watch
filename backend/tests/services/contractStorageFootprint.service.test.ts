import { describe, it, expect, vi } from "vitest";
import {
  computeFootprintStatus,
  computeGrowth,
  DEFAULT_STORAGE_THRESHOLDS,
} from "../../src/services/contractStorageFootprint.service.js";

function createQueryBuilder(rows: any[] = []) {
  const builder: any = {
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    insert: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
    then: (resolve: (value: any) => any) => resolve(rows),
  };
  return builder;
}

const state = vi.hoisted(() => ({ rows: [] as any[] }));

const mockKnex = vi.hoisted(() => {
  const knex: any = vi.fn(() => createQueryBuilder(state.rows));
  return knex;
});

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockKnex,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { ContractStorageFootprintService } = await import(
  "../../src/services/contractStorageFootprint.service.js"
);

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    contract_id: "CCONTRACT1",
    label: "vault",
    ledger_seq: 100,
    persistent_entries: 10,
    temporary_entries: 2,
    instance_entries: 1,
    total_size_bytes: 1024,
    min_rent_expiration_ledger: 5000,
    recorded_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeFootprintStatus", () => {
  it("is healthy below the warning threshold", () => {
    expect(computeFootprintStatus(1024, DEFAULT_STORAGE_THRESHOLDS)).toBe("healthy");
  });

  it("is warning at or above the warning threshold", () => {
    expect(computeFootprintStatus(DEFAULT_STORAGE_THRESHOLDS.warningBytes, DEFAULT_STORAGE_THRESHOLDS)).toBe(
      "warning"
    );
  });

  it("is critical at or above the critical threshold", () => {
    expect(computeFootprintStatus(DEFAULT_STORAGE_THRESHOLDS.criticalBytes, DEFAULT_STORAGE_THRESHOLDS)).toBe(
      "critical"
    );
  });
});

describe("computeGrowth", () => {
  it("reports stable with zero growth when there is no previous snapshot", () => {
    const result = computeGrowth({ totalSizeBytes: 1000, recordedAt: new Date() }, null);
    expect(result).toEqual({ trend: "stable", growthBytesPerDay: 0 });
  });

  it("reports increasing trend when size grows over time", () => {
    const previous = { totalSizeBytes: 1000, recordedAt: new Date("2026-08-20T00:00:00Z") };
    const current = { totalSizeBytes: 2000, recordedAt: new Date("2026-08-21T00:00:00Z") };
    const result = computeGrowth(current, previous);
    expect(result.trend).toBe("increasing");
    expect(result.growthBytesPerDay).toBeCloseTo(1000, 5);
  });

  it("reports decreasing trend when size shrinks over time", () => {
    const previous = { totalSizeBytes: 2000, recordedAt: new Date("2026-08-20T00:00:00Z") };
    const current = { totalSizeBytes: 1000, recordedAt: new Date("2026-08-21T00:00:00Z") };
    const result = computeGrowth(current, previous);
    expect(result.trend).toBe("decreasing");
  });

  it("guards against non-positive elapsed time", () => {
    const same = new Date("2026-08-20T00:00:00Z");
    const result = computeGrowth(
      { totalSizeBytes: 2000, recordedAt: same },
      { totalSizeBytes: 1000, recordedAt: same }
    );
    expect(result).toEqual({ trend: "stable", growthBytesPerDay: 0 });
  });
});

describe("ContractStorageFootprintService", () => {
  it("records a snapshot", async () => {
    state.rows = [makeRow()];
    const service = new ContractStorageFootprintService();

    const snapshot = await service.recordSnapshot({
      contractId: "CCONTRACT1",
      ledgerSeq: 100,
      persistentEntries: 10,
      temporaryEntries: 2,
      instanceEntries: 1,
      totalSizeBytes: 1024,
    });

    expect(snapshot.contractId).toBe("CCONTRACT1");
    expect(snapshot.totalSizeBytes).toBe(1024);
  });

  it("builds a dashboard ranking contracts by size with per-contract status", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    state.rows = [
      makeRow({
        id: "s2",
        contract_id: "CBIG",
        total_size_bytes: DEFAULT_STORAGE_THRESHOLDS.criticalBytes + 1,
        recorded_at: now.toISOString(),
      }),
      makeRow({
        id: "s1",
        contract_id: "CBIG",
        total_size_bytes: DEFAULT_STORAGE_THRESHOLDS.criticalBytes - 5000,
        recorded_at: yesterday.toISOString(),
      }),
      makeRow({
        id: "s3",
        contract_id: "CSMALL",
        total_size_bytes: 512,
        recorded_at: now.toISOString(),
      }),
    ];

    const service = new ContractStorageFootprintService();
    const dashboard = await service.getDashboard();

    expect(dashboard.totalContracts).toBe(2);
    expect(dashboard.contracts[0].contractId).toBe("CBIG");
    expect(dashboard.contracts[0].status).toBe("critical");
    expect(dashboard.contracts[0].trend).toBe("increasing");
    expect(dashboard.contracts[1].contractId).toBe("CSMALL");
    expect(dashboard.contracts[1].status).toBe("healthy");
    expect(dashboard.statusCounts.critical).toBe(1);
    expect(dashboard.statusCounts.healthy).toBe(1);
  });

  it("returns snapshot history for a contract", async () => {
    state.rows = [makeRow(), makeRow({ id: "s2", ledger_seq: 90 })];
    const service = new ContractStorageFootprintService();

    const history = await service.getContractHistory("CCONTRACT1", 10);

    expect(history).toHaveLength(2);
  });
});
