import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Stellar SDK and Soroban RPC components
const mocks = vi.hoisted(() => {
  const scvU64Obj = { name: "scvU64" };
  const scvBoolObj = { name: "scvBool" };

  class MockScVal {
    static scvBytes = vi.fn(() => new MockScVal());
    static scvVec = vi.fn(() => new MockScVal());
    static scvString = vi.fn(() => new MockScVal());
    static scvI128 = vi.fn(() => new MockScVal());
    static scvU64 = vi.fn(() => new MockScVal());
    static scvMap = vi.fn(() => new MockScVal());
    static scvSymbol = vi.fn(() => new MockScVal());

    switch = vi.fn().mockReturnValue(scvU64Obj);
    u64 = vi.fn(() => ({
      toBigInt: vi.fn().mockReturnValue(42n),
    }));
    b = vi.fn().mockReturnValue(true);
  }

  class MockInt128Parts {
    constructor(public parts: any) {}
  }

  class MockInt64 {
    static fromString = vi.fn((str) => str);
  }

  class MockUint64 {
    static fromString = vi.fn((str) => str);
  }

  class MockScMapEntry {
    constructor(public entry: any) {}
  }

  const mockGetTransactionResult = {
    status: "SUCCESS",
    returnValue: new MockScVal(),
  };

  const mockSendTransactionResult = {
    status: "SUCCESS",
    hash: "tx-123",
  };

  const mockSimulateResult = {
    error: null,
    result: {
      retval: new MockScVal(),
    },
  };

  const mockSorobanServer = {
    getAccount: vi.fn().mockResolvedValue({
      publicKey: () => "G_OPERATOR",
      sequence: "1",
    }),
    simulateTransaction: vi.fn().mockResolvedValue(mockSimulateResult),
    sendTransaction: vi.fn().mockResolvedValue(mockSendTransactionResult),
    getTransaction: vi.fn().mockResolvedValue(mockGetTransactionResult),
  };

  const mockKeypair = {
    publicKey: () => "G_OPERATOR",
    sign: vi.fn(),
  };

  return {
    scvU64Obj,
    scvBoolObj,
    MockScVal,
    MockInt128Parts,
    MockInt64,
    MockUint64,
    MockScMapEntry,
    mockGetTransactionResult,
    mockSendTransactionResult,
    mockSimulateResult,
    mockSorobanServer,
    mockKeypair,
    circuitBreakerPaused: false,
  };
});

vi.mock("@stellar/stellar-sdk", () => {
  const mockTxBuilder = {
    addOperation: vi.fn().mockReturnThis(),
    setTimeout: vi.fn().mockReturnThis(),
    build: vi.fn().mockReturnValue({
      sign: vi.fn(),
    }),
  };

  return {
    Networks: {
      PUBLIC: "PUBLIC",
      TESTNET: "TESTNET",
    },
    Keypair: {
      fromSecret: vi.fn(() => mocks.mockKeypair),
      random: vi.fn(() => mocks.mockKeypair),
    },
    Account: class {
      constructor(public pk: string, public seq: string) {}
    },
    Contract: class {
      constructor(public addr: string) {}
      call = vi.fn().mockReturnValue({});
    },
    TransactionBuilder: vi.fn().mockImplementation(() => mockTxBuilder),
    xdr: {
      ScVal: mocks.MockScVal,
      Int128Parts: mocks.MockInt128Parts,
      Int64: mocks.MockInt64,
      Uint64: mocks.MockUint64,
      ScMapEntry: mocks.MockScMapEntry,
      ScValType: {
        scvBool: vi.fn().mockReturnValue(mocks.scvBoolObj),
        scvU64: vi.fn().mockReturnValue(mocks.scvU64Obj),
      },
    },
    SorobanRpc: {
      Server: vi.fn().mockImplementation(() => mocks.mockSorobanServer),
      Api: {
        isSimulationError: vi.fn().mockReturnValue(false),
        GetTransactionStatus: {
          SUCCESS: "SUCCESS",
          FAILED: "FAILED",
        },
      },
      assembleTransaction: vi.fn().mockReturnValue({
        build: vi.fn().mockReturnValue({
          sign: vi.fn(),
        }),
      }),
    },
  };
});

// Mock Circuit Breaker
vi.mock("../../src/services/circuitBreaker.service.js", () => {
  return {
    getCircuitBreakerService: vi.fn(() => ({
      isPaused: vi.fn().mockImplementation(async () => mocks.circuitBreakerPaused),
    })),
    PauseScope: {
      Bridge: "bridge",
    },
  };
});

// Mock database connection
let defaultDbResult: any = [];
function createQueryBuilder(resolveValue: any = []) {
  const builder: any = {};
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.onConflict = vi.fn().mockReturnValue(builder);
  builder.merge = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.first = vi.fn().mockImplementation(() => Promise.resolve(Array.isArray(resolveValue) ? resolveValue[0] : resolveValue));
  builder.count = vi.fn().mockReturnValue(builder);
  builder.clone = vi.fn().mockReturnValue(builder);
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.offset = vi.fn().mockReturnValue(builder);
  builder.andWhere = vi.fn().mockReturnValue(builder);
  builder.then = vi.fn().mockImplementation((resolve) => resolve(resolveValue));
  return builder;
}

const mockDb = vi.fn((table: string) => {
  if (table === "bridge_operators") {
    return createQueryBuilder([{
      contract_address: "C_CONTRACT",
      contractAddress: "C_CONTRACT",
      bridge_id: "bridge-1",
      bridgeId: "bridge-1",
      asset_code: "USDC",
      assetCode: "USDC"
    }]);
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

vi.mock("../../src/config/index.js", () => ({
  config: {
    SOROBAN_RPC_URL: "https://soroban-testnet.stellar.org",
    STELLAR_NETWORK: "testnet",
    NODE_ENV: "test",
  },
}));

import { ReserveVerificationService } from "../../src/services/reserveVerification.service.js";

const testHash32 = "a".repeat(64);
const testHash32Sibling = "b".repeat(64);

describe("ReserveVerificationService", () => {
  let service: ReserveVerificationService;

  beforeEach(() => {
    service = new ReserveVerificationService();
    defaultDbResult = [];
    mocks.circuitBreakerPaused = false;
    process.env.OPERATOR_SECRET_BRIDGE_1 = "SDJZ5373R2QNW3A3U6466PVMQL3FNYJ24SPJWJMX7RGL4XGQL2ZZZZZZ";
    vi.clearAllMocks();
  });

  describe("commitReserves", () => {
    it("successfully commits reserves on-chain when not paused", async () => {
      mocks.mockGetTransactionResult.status = "SUCCESS";
      mocks.mockGetTransactionResult.returnValue.switch.mockReturnValue(mocks.scvU64Obj);
      const sequence = await service.commitReserves("bridge-1", testHash32, 1000000n);
      expect(sequence).toBe(42);
      expect(mockDb).toHaveBeenCalledWith("reserve_commitments");
    });

    it("throws an error when bridge is paused by circuit breaker", async () => {
      mocks.circuitBreakerPaused = true;
      await expect(service.commitReserves("bridge-1", testHash32, 1000000n))
        .rejects.toThrow("Bridge bridge-1 is paused by circuit breaker");
    });
  });

  describe("verifyProofOnChain", () => {
    it("returns true when proof is successfully simulated and verified on-chain", async () => {
      // returnValue.switch() matches ScValType.scvBool() in mock setup
      mocks.mockSimulateResult.result.retval.switch.mockReturnValue(mocks.scvBoolObj);
      const result = await service.verifyProofOnChain("bridge-1", 10, {
        leafHash: testHash32,
        proofPath: [testHash32Sibling],
        leafIndex: 0,
      });

      expect(result).toBe(true);
    });
  });

  describe("saveCommitment", () => {
    it("inserts a new commitment record into database", async () => {
      await service.saveCommitment({
        bridgeId: "bridge-1",
        sequence: 1,
        merkleRootHex: testHash32,
        totalReserves: 100n,
      });
      expect(mockDb).toHaveBeenCalledWith("reserve_commitments");
    });
  });

  describe("saveVerificationResult", () => {
    it("inserts a verification result into database", async () => {
      await service.saveVerificationResult({
        bridgeId: "bridge-1",
        sequence: 1,
        leafHash: testHash32,
        leafIndex: 0,
        isValid: true,
        jobId: "job-1",
      });
      expect(mockDb).toHaveBeenCalledWith("verification_results");
    });
  });

  describe("updateCommitmentStatus", () => {
    it("updates target commitment status in database", async () => {
      await service.updateCommitmentStatus("bridge-1", 1, "verified");
      expect(mockDb).toHaveBeenCalledWith("reserve_commitments");
    });
  });

  describe("getCommitment", () => {
    it("retrieves target commitment record", async () => {
      const record = { bridge_id: "bridge-1", sequence: 1 };
      defaultDbResult = [record];
      const result = await service.getCommitment("bridge-1", 1);
      expect(result).toEqual(record);
    });
  });

  describe("getLatestCommitment", () => {
    it("retrieves latest commitment record for the bridge", async () => {
      const record = { bridge_id: "bridge-1", sequence: 10 };
      defaultDbResult = [record];
      const result = await service.getLatestCommitment("bridge-1");
      expect(result).toEqual(record);
    });
  });

  describe("getCommitmentHistory", () => {
    it("retrieves commitment history list for the bridge", async () => {
      const records = [{ bridge_id: "bridge-1", sequence: 10 }];
      defaultDbResult = records;
      const result = await service.getCommitmentHistory("bridge-1");
      expect(result).toEqual(records);
    });
  });

  describe("getVerificationResults", () => {
    it("retrieves verification results list", async () => {
      const records = [{ bridge_id: "bridge-1", sequence: 1 }];
      defaultDbResult = records;
      const result = await service.getVerificationResults("bridge-1", 1);
      expect(result).toEqual(records);
    });
  });

  describe("getActiveBridgeOperators", () => {
    it("retrieves active bridge operators", async () => {
      const result = await service.getActiveBridgeOperators();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].bridgeId).toBe("bridge-1");
    });
  });
});
