import { describe, it, expect, beforeEach } from "vitest";
import { BridgeTvlChangeNotificationService } from "../../src/services/bridgeTvlChangeNotification.service.js";

describe("BridgeTvlChangeNotificationService (#1133)", () => {
  let service: BridgeTvlChangeNotificationService;

  beforeEach(() => {
    service = new BridgeTvlChangeNotificationService();
  });

  it("validates subscription input", () => {
    expect(() => service.subscribe({ bridgeId: "", pctThreshold: 10, channels: ["c1"] })).toThrow();
    expect(() =>
      service.subscribe({ bridgeId: "b1", pctThreshold: 0, channels: ["c1"] }),
    ).toThrow(/pctThreshold/);
    expect(() => service.subscribe({ bridgeId: "b1", pctThreshold: 10, channels: [] })).toThrow(
      /channel/,
    );
  });

  it("does not notify on the first sample, only on a threshold-crossing change", () => {
    service.subscribe({ bridgeId: "b1", pctThreshold: 10, channels: ["c1"] });

    expect(service.recordTvlSample("b1", 1_000_000, 0)).toHaveLength(0);
    // +5% move, below the 10% threshold.
    expect(service.recordTvlSample("b1", 1_050_000, 1_000)).toHaveLength(0);
    // Now cumulative from last sample is +~19%, crosses threshold.
    const fired = service.recordTvlSample("b1", 1_250_000, 2_000);
    expect(fired).toHaveLength(1);
    expect(fired[0].direction).toBe("increase");
    expect(fired[0].changePct).toBeGreaterThan(10);
    expect(fired[0].channels).toEqual(["c1"]);
  });

  it("treats a drop as more severe than an equivalent rise", () => {
    service.subscribe({ bridgeId: "up", pctThreshold: 5, channels: ["c1"], cooldownMs: 0 });
    service.subscribe({ bridgeId: "down", pctThreshold: 5, channels: ["c1"], cooldownMs: 0 });

    service.recordTvlSample("up", 1_000_000, 0);
    const rise = service.recordTvlSample("up", 1_120_000, 1_000)[0];

    service.recordTvlSample("down", 1_000_000, 0);
    const drop = service.recordTvlSample("down", 880_000, 1_000)[0];

    expect(rise.severity).toBe("warning"); // 12% rise
    expect(drop.severity).toBe("critical"); // 12% drop bumped a tier
    expect(drop.direction).toBe("decrease");
  });

  it("respects direction filters and per-subscription cooldown", () => {
    service.subscribe({
      bridgeId: "b1",
      pctThreshold: 5,
      directions: ["decrease"],
      cooldownMs: 10_000,
      channels: ["c1"],
    });

    service.recordTvlSample("b1", 1_000_000, 0);
    // A rise is ignored by a decrease-only subscription.
    expect(service.recordTvlSample("b1", 1_200_000, 1_000)).toHaveLength(0);
    // First qualifying drop fires.
    expect(service.recordTvlSample("b1", 1_000_000, 2_000)).toHaveLength(1);
    // Second drop within cooldown is suppressed.
    expect(service.recordTvlSample("b1", 800_000, 5_000)).toHaveLength(0);
    // After cooldown, fires again.
    expect(service.recordTvlSample("b1", 600_000, 20_000)).toHaveLength(1);
  });

  it("supports the absolute-USD threshold and records history", () => {
    service.subscribe({
      bridgeId: "b1",
      pctThreshold: 99, // effectively percent-disabled
      absThresholdUsd: 250_000,
      channels: ["c1"],
    });

    service.recordTvlSample("b1", 10_000_000, 0);
    const fired = service.recordTvlSample("b1", 10_300_000, 1_000);
    expect(fired).toHaveLength(1);
    expect(service.getNotifications("b1")).toHaveLength(1);
    expect(service.getNotifications("other")).toHaveLength(0);
  });

  it("unsubscribe stops further notifications", () => {
    const sub = service.subscribe({ bridgeId: "b1", pctThreshold: 5, channels: ["c1"] });
    service.recordTvlSample("b1", 1_000_000, 0);
    expect(service.unsubscribe(sub.id)).toBe(true);
    expect(service.recordTvlSample("b1", 2_000_000, 1_000)).toHaveLength(0);
  });
});
