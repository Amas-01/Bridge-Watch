import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReconciliationService } from "../../src/services/reconciliation.service.js";

// Mock connection
let defaultDbResult: any = [];

function createQueryBuilder(resolveValue: any = []) {
  const builder: any = {};
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.returning = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.first = vi.fn().mockImplementation(() => Promise.resolve(Array.isArray(resolveValue) ? resolveValue[0] : resolveValue));
  builder.andWhere = vi.fn().mockReturnValue(builder);
  builder.catch = vi.fn().mockImplementation((cb) => {
    return Promise.resolve(resolveValue);
  });
  builder.then = vi.fn().mockImplementation((resolve) => resolve(resolveValue));
  return builder;
}

const mockDb = vi.fn((table: string) => {
  if (table === "assets") {
    return createQueryBuilder([
      { symbol: "USDC", issuer: "G_USDC", bridge_provider: "circle", source_chain: "ethereum" }
    ]);
  }
  if (table === "bridges") {
    return createQueryBuilder([
      { name: "circle USDC", source_chain: "ethereum" }
    ]);
  }
  if (table === "bridge_operators") {
    return createQueryBuilder({ bridge_id: "circle" });
  }
  if (table === "reserve_commitments") {
    return createQueryBuilder({
      bridge_id: "circle",
      sequence: 10,
      merkle_root: "0xMerkle",
      total_reserves: "1000000",
      status: "verified",
      tx_hash: "0xTxHash",
      committed_at: Math.floor(Date.now() / 1000),
      committed_ledger: 1000,
      updated_at: new Date()
    });
  }
  return createQueryBuilder(defaultDbResult);
});

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: () => mockDb,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe("ReconciliationService", () => {
  let service: ReconciliationService;

  beforeEach(() => {
    service = new ReconciliationService();
    defaultDbResult = [];
    vi.clearAllMocks();
  });

  describe("startRun", () => {
    it("starts a run and returns run id", async () => {
      defaultDbResult = [{ id: "run-123" }];
      const result = await service.startRun({
        assetCode: "USDC",
        jobId: "job-1",
        attempt: 1,
      });

      expect(result.id).toBe("run-123");
      expect(mockDb).toHaveBeenCalledWith("reconciliation_runs");
    });
  });

  describe("finishRun", () => {
    it("updates existing run status and details", async () => {
      defaultDbResult = 1; // 1 row updated
      await service.finishRun({
        id: "run-123",
        status: "success",
        stellarSupply: 1000000,
        reportedSupply: 1000000,
        mismatchPercentage: 0,
      });

      expect(mockDb).toHaveBeenCalledWith("reconciliation_runs");
    });
  });

  describe("listRuns", () => {
    it("returns list of reconciliation runs", async () => {
      const runs = [
        { id: "run-1", asset_code: "USDC", status: "success", started_at: new Date() },
        { id: "run-2", asset_code: "USDC", status: "mismatch", started_at: new Date() },
      ];
      defaultDbResult = runs;

      const result = await service.listRuns({ assetCode: "USDC", limit: 10 });
      expect(result).toEqual(runs);
    });
  });

  describe("getLatestRun", () => {
    it("returns the latest reconciliation run for an asset", async () => {
      const run = { id: "run-2", asset_code: "USDC", status: "mismatch", started_at: new Date() };
      defaultDbResult = [run];

      const result = await service.getLatestRun("USDC");
      expect(result).toEqual(run);
    });
  });

  describe("getDriftSummaries", () => {
    it("aggregates reconciliation runs and returns drift summaries", async () => {
      const mockRuns = [
        {
          id: "run-1",
          asset_code: "USDC",
          bridge_name: "circle USDC",
          source_chain: "ethereum",
          status: "mismatch",
          stellar_supply: "1005000",
          reported_supply: "1000000",
          mismatch_percentage: "0.5",
          attempt: 1,
          started_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          triage_status: "open",
        },
      ];
      defaultDbResult = mockRuns;

      const result = await service.getDriftSummaries({ range: "24h" });
      expect(result.totals.summaries).toBe(1);
      expect(result.totals.unresolved).toBe(1);
      expect(result.summaries[0].severity).toBe("low");
    });
  });

  describe("getMismatchDetail", () => {
    it("returns detailed mismatch information along with history and commitments", async () => {
      const mockRun = {
        id: "run-1",
        asset_code: "USDC",
        bridge_name: "circle USDC",
        source_chain: "ethereum",
        status: "mismatch",
        stellar_supply: "1005000",
        reported_supply: "1000000",
        mismatch_percentage: "0.5",
        attempt: 1,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        triage_status: "open",
      };
      defaultDbResult = [mockRun];

      const result = await service.getMismatchDetail("run-1", { range: "7d" });
      expect(result).not.toBeNull();
      expect(result?.mismatch.id).toBe("run-1");
      expect(result?.reserveCommitment).toBeDefined();
    });
  });

  describe("updateTriageStatus", () => {
    it("updates triage status, owner, and notes", async () => {
      const mockRun = {
        id: "run-1",
        asset_code: "USDC",
        bridge_name: "circle USDC",
        source_chain: "ethereum",
        status: "mismatch",
        stellar_supply: "1005000",
        reported_supply: "1000000",
        mismatch_percentage: "0.5",
        attempt: 1,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        triage_status: "investigating",
        triage_owner: "Alice",
        triage_note: "Investigating the drift",
      };
      defaultDbResult = [mockRun];

      const result = await service.updateTriageStatus("run-1", {
        status: "investigating",
        owner: "Alice",
        note: "Investigating the drift",
      });

      expect(result).not.toBeNull();
      expect(result?.triageStatus).toBe("investigating");
      expect(result?.triageOwner).toBe("Alice");
    });
  });
});
