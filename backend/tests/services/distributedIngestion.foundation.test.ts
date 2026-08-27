import { describe, expect, it } from "vitest";
import { canonicalEventIdentity } from "../../src/services/canonicalEventIdentity.service.js";
import { boundedWatermark, normaliseGaps, type SourceWatermark } from "../../src/services/ingestionWatermarkCoordinator.service.js";

const watermark = (source: string, finalizedThrough: number, gaps: Array<{ from: number; to: number }> = []): SourceWatermark => ({ source, coveredThrough: finalizedThrough, finalizedThrough, gaps, version: 1, observedAt: "2026-01-01T00:00:00.000Z" });

describe("distributed ingestion foundations", () => {
  it("bounds a dependent window to its slowest source", () => { const window = boundedWatermark("metrics", [{ source: "horizon", minimumFinality: 0 }, { source: "evm", minimumFinality: 0 }], { horizon: watermark("horizon", 120), evm: watermark("evm", 95) }); expect(window.through).toBe(95); });
  it("does not silently pass an observed gap, unless an operator override is supplied", () => { const inputs = { horizon: watermark("horizon", 120, [{ from: 101, to: 104 }]) }; expect(boundedWatermark("alerts", [{ source: "horizon", minimumFinality: 0 }], inputs).through).toBeNull(); expect(boundedWatermark("alerts", [{ source: "horizon", minimumFinality: 0 }], inputs, { horizon: 120 }).through).toBe(120); });
  it("normalises out-of-order partitions into stable gaps", () => expect(normaliseGaps([{ from: 8, to: 9 }, { from: 3, to: 5 }, { from: 6, to: 7 }])).toEqual([{ from: 3, to: 9 }]));
  it("keeps canonical event identity stable across provider aliases and decoder upgrades", () => { const event = { chain: "Ethereum", contract: "0xAB", transactionHash: "0xCD", eventIndex: 2, eventType: "Transfer" }; expect(canonicalEventIdentity(event)).toBe(canonicalEventIdentity({ ...event, chain: "ethereum", contract: "0xab", transactionHash: "0xcd" })); });
});
