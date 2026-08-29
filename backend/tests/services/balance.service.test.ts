import { describe, it, expect, vi, beforeEach } from "vitest";
import { BalanceService } from "../../src/services/balance.service.js";

function createQueryBuilder(resolveValue: any = []) {
  const builder: any = {};
  builder.insert = vi.fn().mockReturnValue(builder);
  builder.returning = vi.fn().mockReturnValue(builder);
  builder.where = vi.fn().mockReturnValue(builder);
  builder.update = vi.fn().mockReturnValue(builder);
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.first = vi.fn().mockImplementation(() =>
    Promise.resolve(Array.isArray(resolveValue) ? resolveValue[0] : resolveValue)
  );
  builder.andWhere = vi.fn().mockReturnValue(builder);
  builder.groupBy = vi.fn().mockReturnValue(builder);
  builder.sum = vi.fn().mockReturnValue(builder);
  builder.onConflict = vi.fn().mockReturnValue(builder);
  builder.merge = vi.fn().mockReturnValue(builder);
  builder.catch = vi.fn().mockImplementation((cb: any) => Promise.resolve(resolveValue));
  builder.then = vi.fn().mockImplementation((resolve: any) => resolve(resolveValue));
  return builder;
}

let mockTrackedBalancesResult: any[] = [];
let mockOperatorStakeResult: any = null;

const mockDb = vi.fn((table: string) => {
  if (table === "tracked_balances") {
    return createQueryBuilder(mockTrackedBalancesResult);
  }
  if (table === "bridge_operators") {
    const builder = createQueryBuilder(mockOperatorStakeResult);
    builder.where = vi.fn().mockReturnValue(builder);
    builder.sum = vi.fn().mockReturnValue(builder);
    builder.first = vi.fn().mockImplementation(() =>
      Promise.resolve(mockOperatorStakeResult)
    );
    return builder;
  }
  return createQueryBuilder([]);
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
    ETHEREUM_RPC_URL: undefined,
    POLYGON_RPC_URL: undefined,
    BASE_RPC_URL: undefined,
  },
  SUPPORTED_ASSETS: [
    { code: "USDC", issuer: "G_USDC" },
    { code: "EURC", issuer: "G_EURC" },
  ],
}));

describe("BalanceService.reconcileBalances", () => {
  let service: BalanceService;

  beforeEach(() => {
    service = new BalanceService();
    mockTrackedBalancesResult = [];
    mockOperatorStakeResult = null;
  });

  it("should compute activeLiquidReserve = reserveBalance - lockedStakes", async () => {
    mockTrackedBalancesResult = [
      { address_type: "issuer", balance: 10000 },
      { address_type: "reserve", balance: 6000 },
      { address_type: "custody", balance: 0 },
    ];
    mockOperatorStakeResult = { total_stake: 1000 };

    const result = await service.reconcileBalances("USDC");

    expect(result.issuerBalance).toBe(10000);
    expect(result.reserveBalance).toBe(6000);
    expect(result.lockedStakes).toBe(1000);
    expect(result.activeLiquidReserve).toBe(5000);
    expect(result.delta).toBe(5000);
  });

  it("should report 0 lockedStakes when no active operators exist", async () => {
    mockTrackedBalancesResult = [
      { address_type: "issuer", balance: 10000 },
      { address_type: "reserve", balance: 6000 },
    ];
    mockOperatorStakeResult = { total_stake: null };

    const result = await service.reconcileBalances("USDC");

    expect(result.lockedStakes).toBe(0);
    expect(result.activeLiquidReserve).toBe(6000);
    expect(result.delta).toBe(4000);
  });

  it("should subtract locked operator stakes from multi-token backing calculations", async () => {
    mockTrackedBalancesResult = [
      { address_type: "issuer", balance: 100000 },
      { address_type: "reserve", balance: 6000 },
    ];
    mockOperatorStakeResult = { total_stake: 1000 };

    const result = await service.reconcileBalances("USDC");

    expect(result.activeLiquidReserve).toBe(5000);
    expect(result.activeLiquidReserve).not.toBe(6000);
  });

  it("should handle zero reserve balance correctly", async () => {
    mockTrackedBalancesResult = [
      { address_type: "issuer", balance: 5000 },
      { address_type: "reserve", balance: 0 },
    ];
    mockOperatorStakeResult = { total_stake: 1000 };

    const result = await service.reconcileBalances("EURC");

    expect(result.reserveBalance).toBe(0);
    expect(result.lockedStakes).toBe(1000);
    expect(result.activeLiquidReserve).toBe(-1000);
    expect(result.delta).toBe(6000);
  });
});
