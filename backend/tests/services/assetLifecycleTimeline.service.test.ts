import { describe, it, expect, vi, beforeEach } from "vitest";
import { getDatabase } from "../../src/database/connection.js";
import { AssetLifecycleTimelineService } from "../../src/services/assetLifecycleTimeline.service.js";

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "alt-1",
    asset_id: "USDC:GA5ZSEJYB37JRC5AVCIA5XYF4DZ62C2Z54MICLX4KCH7RE4P7MCE47C3",
    asset_symbol: "USDC",
    state: "ACTIVE",
    previous_state: "PROVISIONED",
    reason: "Initial issuance audit passed",
    triggered_by: "admin-1",
    metadata: JSON.stringify({ auditRef: "AUD-123" }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

let currentChain: Record<string, unknown> = {};

function makeChain(rows: unknown[] = [], updated?: unknown) {
  const chain: Record<string, unknown> = {};
  chain.modify = vi.fn().mockImplementation((mod: (qb: unknown) => void) => {
    mod(chain);
    return chain;
  });
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockReturnValue(chain);
  chain.offset = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.whereNull = vi.fn().mockReturnValue(chain);
  chain.distinct = vi.fn().mockReturnValue(chain);
  chain.first = vi.fn().mockResolvedValue(rows[0]);
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.returning = vi.fn().mockResolvedValue(updated ? [updated] : rows.length ? [makeRow()] : []);
  chain.groupBy = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.raw = (v: string) => ({ sql: v });
  chain.then = vi.fn().mockImplementation((resolve) => {
    resolve(rows);
    return Promise.resolve();
  });
  currentChain = chain;
  return chain;
}

function dbMock() {
  const dbFn = vi.fn().mockImplementation(() => currentChain);
  (dbFn as unknown as Record<string, unknown>).raw = (v: string) => ({ sql: v });
  return dbFn as never;
}

describe("AssetLifecycleTimelineService", () => {
  let service: AssetLifecycleTimelineService;

  beforeEach(() => {
    service = new AssetLifecycleTimelineService();
    makeChain([makeRow()], makeRow());
    vi.mocked(getDatabase).mockReturnValue(dbMock() as never);
  });

  it("records asset state transition successfully", async () => {
    makeChain([], makeRow());
    const record = await service.recordTransition({
      assetId: "USDC:GA5ZSEJYB37JRC5AVCIA5XYF4DZ62C2Z54MICLX4KCH7RE4P7MCE47C3",
      assetSymbol: "USDC",
      state: "ACTIVE",
      previousState: "PROVISIONED",
      reason: "Initial issuance audit passed",
      triggeredBy: "admin-1",
    });

    expect(record.state).toBe("ACTIVE");
    expect(record.assetSymbol).toBe("USDC");
    expect(record.triggeredBy).toBe("admin-1");
  });

  it("throws error when assetId or assetSymbol is missing", async () => {
    await expect(
      service.recordTransition({
        assetId: "",
        assetSymbol: "USDC",
        state: "ACTIVE",
        triggeredBy: "admin-1",
      })
    ).rejects.toThrow("assetId and assetSymbol are required");
  });

  it("fetches timeline records for asset", async () => {
    const timeline = await service.getTimeline("USDC:GA5ZSEJYB37JRC5AVCIA5XYF4DZ62C2Z54MICLX4KCH7RE4P7MCE47C3");
    expect(timeline).toHaveLength(1);
    expect(timeline[0].assetSymbol).toBe("USDC");
  });

  it("returns latest state for an asset", async () => {
    const latest = await service.getLatestState("USDC:GA5ZSEJYB37JRC5AVCIA5XYF4DZ62C2Z54MICLX4KCH7RE4P7MCE47C3");
    expect(latest).not.toBeNull();
    expect(latest?.state).toBe("ACTIVE");
  });

  it("calculates asset timeline statistics", async () => {
    makeChain([
      { state: "ACTIVE", cnt: 5 },
      { state: "PAUSED", cnt: 2 },
    ]);
    const stats = await service.getStats();
    expect(stats.byState.ACTIVE).toBe(5);
    expect(stats.byState.PAUSED).toBe(2);
    expect(stats.totalTransitions).toBe(7);
  });
});
