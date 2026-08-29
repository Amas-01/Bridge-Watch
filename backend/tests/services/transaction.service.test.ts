import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Stellar SDK
const mocks = vi.hoisted(() => {
  class MockAsset {
    constructor(public code: string, public issuer: string) {}
  }

  const mockHorizonPaymentsRecords = {
    records: [] as any[],
  };

  const mockHorizonPaymentsCall = vi.fn().mockResolvedValue(mockHorizonPaymentsRecords);

  const mockHorizonPaymentsBuilder: any = {
    forAsset: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    cursor: vi.fn().mockReturnThis(),
    call: mockHorizonPaymentsCall,
  };

  class MockHorizonServer {
    constructor(public url: string, public opts: any) {}
    payments = vi.fn().mockReturnValue(mockHorizonPaymentsBuilder);
  }

  return {
    MockAsset,
    MockHorizonServer,
    mockHorizonPaymentsRecords,
  };
});

vi.mock("@stellar/stellar-sdk", () => {
  return {
    Asset: mocks.MockAsset,
    Horizon: {
      Server: mocks.MockHorizonServer,
    },
  };
});

// Mock database connection
let defaultDbResult: any = [];
let defaultSyncState: any = null;

function createQueryBuilder(resolveValue: any = []) {
  const builder: any = {};
  let cloneCount = 0;
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.onConflict = vi.fn().mockReturnValue(builder);
  builder.merge = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.first = vi.fn().mockImplementation(() => Promise.resolve(Array.isArray(resolveValue) ? resolveValue[0] : resolveValue));
  builder.count = vi.fn().mockReturnValue(builder);
  builder.clone = vi.fn().mockImplementation(() => {
    cloneCount++;
    if (cloneCount === 1) {
      return createQueryBuilder([{ count: "1" }]);
    } else {
      return createQueryBuilder(defaultDbResult);
    }
  });
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.offset = vi.fn().mockReturnValue(builder);
  builder.andWhere = vi.fn().mockImplementation((fn) => {
    if (typeof fn === "function") {
      fn(builder);
    }
    return builder;
  });
  builder.orWhere = vi.fn().mockReturnValue(builder);
  builder.then = vi.fn().mockImplementation((resolve) => resolve(resolveValue));
  return builder;
}

const mockDb = vi.fn((table: string) => {
  if (table === "asset_transaction_sync_state") {
    return createQueryBuilder(defaultSyncState);
  }
  return createQueryBuilder(defaultDbResult);
});
(mockDb as any).raw = vi.fn((str) => str);
(mockDb as any).fn = {
  now: vi.fn(() => new Date()),
};

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

vi.mock("../../src/config/index.js", () => ({
  config: {
    STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
    NODE_ENV: "test",
  },
}));

import { TransactionService } from "../../src/services/transaction.service.js";

describe("TransactionService", () => {
  let service: TransactionService;

  beforeEach(() => {
    service = new TransactionService();
    defaultDbResult = [];
    defaultSyncState = null;
    mocks.mockHorizonPaymentsRecords.records = [];
    vi.clearAllMocks();
  });

  describe("fetchTransactionsByAsset", () => {
    it("fetches payments from Horizon and upserts into database", async () => {
      const mockRecord = {
        id: "op-1",
        type: "payment",
        transaction_hash: "tx-1",
        transaction_successful: true,
        ledger: 12345,
        paging_token: "pt-123",
        source_account: "GA1",
        from: "GA1",
        to: "GA2",
        amount: "100.5",
        created_at: new Date().toISOString(),
      };
      mocks.mockHorizonPaymentsRecords.records = [mockRecord];

      const result = await service.fetchTransactionsByAsset("USDC", "G_ISSUER", {
        pageSize: 10,
        maxPages: 1,
      });

      expect(result.fetched).toBe(1);
      expect(result.stored).toBe(1);
      expect(result.lastCursor).toBe("pt-123");
      expect(mockDb).toHaveBeenCalledWith("asset_transactions");
      expect(mockDb).toHaveBeenCalledWith("asset_transaction_sync_state");
    });

    it("handles zero fetched records cleanly", async () => {
      mocks.mockHorizonPaymentsRecords.records = [];

      const result = await service.fetchTransactionsByAsset("USDC", "G_ISSUER", {
        pageSize: 10,
        maxPages: 1,
      });

      expect(result.fetched).toBe(0);
      expect(result.stored).toBe(0);
      expect(result.lastCursor).toBeNull();
    });
  });

  describe("backfillAssetTransactions", () => {
    it("backfills asset transactions by fetching history in ascending order", async () => {
      const mockRecord = {
        id: "op-1",
        type: "payment",
        transaction_hash: "tx-1",
        transaction_successful: true,
        paging_token: "pt-1",
      };
      mocks.mockHorizonPaymentsRecords.records = [mockRecord];

      const result = await service.backfillAssetTransactions("USDC", "G_ISSUER", {
        pages: 1,
      });

      expect(result.fetched).toBe(1);
      expect(result.stored).toBe(1);
    });
  });

  describe("detectNewTransactions", () => {
    it("detects new transactions using saved cursor", async () => {
      defaultSyncState = {
        asset_code: "USDC",
        asset_issuer: "G_ISSUER",
        last_paging_token: "pt-500",
      };

      const result = await service.detectNewTransactions("USDC", "G_ISSUER");
      expect(result.fetched).toBe(0);
    });
  });

  describe("listTransactions", () => {
    it("queries database and returns filtered/paginated transaction list", async () => {
      const dbRows = [
        {
          id: "1",
          transaction_hash: "tx-1",
          bridge_name: "circle",
          asset_code: "USDC",
          amount: "100",
          status: "completed",
          occurred_at: new Date(),
          fee_charged: "0.01",
        },
      ];
      defaultDbResult = dbRows;

      const result = await service.listTransactions({ asset: "USDC" }, 1, 10);
      expect(result.total).toBe(1);
      expect(result.transactions.length).toBe(1);
      expect(result.transactions[0].txHash).toBe("tx-1");
    });
  });

  describe("exportTransactionsCsv", () => {
    it("returns transactions formatted as CSV string", async () => {
      const dbRows = [
        {
          id: "1",
          transaction_hash: "tx-1",
          bridge_name: "circle",
          asset_code: "USDC",
          amount: "100",
          status: "completed",
          occurred_at: new Date(),
          fee_charged: "0.01",
        },
      ];
      defaultDbResult = dbRows;

      const csv = await service.exportTransactionsCsv({ asset: "USDC" });
      expect(csv).toContain("id,txHash,bridge,asset,operationType,status,amount,fee,senderAddress,recipientAddress,timestamp");
      expect(csv).toContain("tx-1");
    });
  });

  describe("getSyncState", () => {
    it("returns sync state from database", async () => {
      const state = {
        asset_code: "USDC",
        asset_issuer: "G_ISSUER",
        last_paging_token: "pt-123",
      };
      defaultSyncState = state;

      const result = await service.getSyncState("USDC", "G_ISSUER");
      expect(result).toEqual(state);
    });
  });
});
