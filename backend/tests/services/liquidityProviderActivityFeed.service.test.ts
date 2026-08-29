import { describe, it, expect, beforeEach } from "vitest";
import {
  LiquidityProviderActivityFeedService,
  type LpActivityInput,
} from "../../src/services/liquidityProviderActivityFeed.service.js";

describe("LiquidityProviderActivityFeedService (#1134)", () => {
  let service: LiquidityProviderActivityFeedService;

  beforeEach(() => {
    service = new LiquidityProviderActivityFeedService();
  });

  const ev = (over: Partial<LpActivityInput>): LpActivityInput => ({
    poolId: "USDC-XLM",
    provider: "GABCDEF1234567890XYZ",
    action: "add",
    amountUsd: 1000,
    txHash: `tx_${Math.random().toString(36).slice(2)}`,
    chain: "stellar",
    ...over,
  });

  it("validates required fields and action / amount", () => {
    expect(() => service.record(ev({ poolId: "" }))).toThrow();
    // @ts-expect-error deliberate bad action
    expect(() => service.record(ev({ action: "swap" }))).toThrow(/Unknown LP action/);
    expect(() => service.record(ev({ amountUsd: -5 }))).toThrow(/amountUsd/);
  });

  it("signs outflows negative, fees zero, and is idempotent on tx identity", () => {
    const add = service.record(ev({ txHash: "tx1", action: "add", amountUsd: 5000 }));
    const remove = service.record(ev({ txHash: "tx2", action: "remove", amountUsd: 2000 }));
    const fees = service.record(ev({ txHash: "tx3", action: "claim_fees", amountUsd: 42 }));

    expect(add.signedAmountUsd).toBe(5000);
    expect(remove.signedAmountUsd).toBe(-2000);
    expect(fees.signedAmountUsd).toBe(0);
    expect(add.providerShort).toMatch(/…/);

    // Replaying the same tx returns the stored event, no duplicate.
    const replay = service.record(ev({ txHash: "tx1", action: "add", amountUsd: 5000 }));
    expect(replay.id).toBe(add.id);
    expect(service.query().events).toHaveLength(3);
  });

  it("returns a newest-first feed with cursor pagination and filters", () => {
    for (let i = 0; i < 5; i++) {
      service.record(ev({ txHash: `tx${i}`, timestamp: 1_000 + i * 100, action: "add" }));
    }
    service.record(ev({ txHash: "txR", timestamp: 5_000, action: "remove", provider: "GOTHER" }));

    const first = service.query({ limit: 3 });
    expect(first.events).toHaveLength(3);
    expect(first.events[0].timestamp).toBe(5_000); // newest first
    expect(first.hasMore).toBe(true);

    const second = service.query({ limit: 3, cursor: first.nextCursor! });
    expect(second.events).toHaveLength(3);
    expect(second.hasMore).toBe(false);

    const removes = service.query({ action: "remove" });
    expect(removes.events).toHaveLength(1);
    expect(removes.events[0].provider).toBe("GOTHER");
  });

  it("summarizes inflow/outflow/net and ranks providers over a window", () => {
    service.record(ev({ txHash: "a", provider: "GWHALE", action: "add", amountUsd: 100_000, timestamp: 10_000 }));
    service.record(ev({ txHash: "b", provider: "GWHALE", action: "remove", amountUsd: 30_000, timestamp: 11_000 }));
    service.record(ev({ txHash: "c", provider: "GRETAIL", action: "add", amountUsd: 5_000, timestamp: 12_000 }));
    service.record(ev({ txHash: "d", provider: "GRETAIL", action: "claim_fees", amountUsd: 250, timestamp: 13_000 }));
    // Outside the window.
    service.record(ev({ txHash: "old", provider: "GRETAIL", action: "add", amountUsd: 999_999, timestamp: 1 }));

    const s = service.summary({ poolId: "USDC-XLM", windowMs: 10_000, now: 14_000 });
    expect(s.eventCount).toBe(4);
    expect(s.uniqueProviders).toBe(2);
    expect(s.grossInflowUsd).toBe(105_000);
    expect(s.grossOutflowUsd).toBe(30_000);
    expect(s.netLiquidityUsd).toBe(75_000);
    expect(s.feesClaimedUsd).toBe(250);
    expect(s.topProviders[0].provider).toBe("GWHALE");
    expect(s.topProviders[0].netUsd).toBe(70_000);
  });
});
