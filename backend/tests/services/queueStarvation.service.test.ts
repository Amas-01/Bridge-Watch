import { describe, it, expect } from "vitest";

import {
  DEFAULT_STARVATION_POLICY,
  type QueueSample,
  type StarvationAssessment,
  type StarvationPolicy,
  assessSample,
  shouldRaiseSignal,
  worstSeverity,
} from "../../src/services/queueStarvation.service.js";

/**
 * Starvation detection.
 *
 * The rule that matters is telling starvation (work present, nothing moving)
 * apart from a backlog (work present, consumers keeping busy). They look the
 * same on a depth graph and need opposite responses, so most of these cases
 * pin that distinction.
 */

const policy: StarvationPolicy = { queueName: "ingest", ...DEFAULT_STARVATION_POLICY };

function sample(overrides: Partial<QueueSample> = {}): QueueSample {
  return {
    queueName: "ingest",
    depth: 10,
    oldestAgeMs: 1_000,
    processedInWindow: 5,
    activeConsumers: 2,
    sampledAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("assessSample", () => {
  it("reports an empty queue as healthy", () => {
    const result = assessSample(sample({ depth: 0, activeConsumers: 0 }), policy);

    // No consumers is fine when there is nothing to consume.
    expect(result.severity).toBe("healthy");
    expect(result.reason).toMatch(/empty/);
  });

  it("reports a draining queue as healthy however deep it is", () => {
    // A backlog is a capacity question, not starvation. Paging on depth alone
    // trains people to ignore the alert.
    const result = assessSample(
      sample({ depth: 50_000, processedInWindow: 400, oldestAgeMs: 30_000 }),
      policy
    );

    expect(result.severity).toBe("healthy");
  });

  it("flags work queued with no consumers attached immediately", () => {
    // Unambiguous: nothing can drain it, so there is no reason to wait out the
    // age threshold first.
    const result = assessSample(
      sample({ depth: 1, activeConsumers: 0, oldestAgeMs: 0, processedInWindow: 0 }),
      policy
    );

    expect(result.severity).toBe("starved");
    expect(result.reason).toMatch(/no consumers/);
  });

  it("flags starvation when nothing drained and the head is old", () => {
    const result = assessSample(
      sample({ processedInWindow: 0, oldestAgeMs: policy.starvedAfterMs }),
      policy
    );

    expect(result.severity).toBe("starved");
    expect(result.reason).toMatch(/nothing processed/);
  });

  it("reports degraded between the two thresholds", () => {
    const result = assessSample(
      sample({ processedInWindow: 0, oldestAgeMs: policy.degradedAfterMs }),
      policy
    );

    expect(result.severity).toBe("degraded");
  });

  it("stays healthy when nothing drained but the head is still young", () => {
    // A single quiet window is not evidence of anything.
    const result = assessSample(
      sample({ processedInWindow: 0, oldestAgeMs: policy.degradedAfterMs - 1 }),
      policy
    );

    expect(result.severity).toBe("healthy");
  });

  it("reports degraded when draining but an item has waited past the limit", () => {
    // Work is moving, so this is not starvation — but something is stuck at the
    // head and that is worth surfacing without paging.
    const result = assessSample(
      sample({ processedInWindow: 20, oldestAgeMs: policy.starvedAfterMs + 1 }),
      policy
    );

    expect(result.severity).toBe("degraded");
    expect(result.reason).toMatch(/draining but/);
  });

  it("respects a disabled policy", () => {
    const result = assessSample(
      sample({ depth: 100, processedInWindow: 0, oldestAgeMs: 10_000_000, activeConsumers: 0 }),
      { ...policy, enabled: false }
    );

    expect(result.severity).toBe("healthy");
    expect(result.reason).toMatch(/disabled/);
  });

  it("falls back to the default policy when none is supplied", () => {
    expect(assessSample(sample({ depth: 0 })).severity).toBe("healthy");
  });

  it("carries the raw signals through for the alert payload", () => {
    const result = assessSample(sample({ depth: 7, oldestAgeMs: 42, activeConsumers: 3 }), policy);

    expect(result.depth).toBe(7);
    expect(result.oldestAgeMs).toBe(42);
    expect(result.activeConsumers).toBe(3);
  });
});

describe("shouldRaiseSignal", () => {
  const starved = (): StarvationAssessment => ({
    queueName: "ingest",
    severity: "starved",
    reason: "",
    depth: 1,
    oldestAgeMs: 0,
    processedInWindow: 0,
    activeConsumers: 1,
  });
  const healthy = (): StarvationAssessment => ({ ...starved(), severity: "healthy" });

  it("does not raise before enough samples exist", () => {
    expect(shouldRaiseSignal([starved(), starved()], { consecutiveSamples: 3 })).toBe(false);
  });

  it("raises on an unbroken run", () => {
    expect(shouldRaiseSignal([starved(), starved(), starved()], { consecutiveSamples: 3 })).toBe(
      true
    );
  });

  it("does not raise when the run is broken", () => {
    // One healthy sample means the queue moved — a deploy or a GC pause, not an
    // outage. The clock restarts.
    expect(
      shouldRaiseSignal([starved(), healthy(), starved(), starved()], { consecutiveSamples: 3 })
    ).toBe(false);
  });

  it("only considers the most recent samples", () => {
    expect(
      shouldRaiseSignal([healthy(), healthy(), starved(), starved(), starved()], {
        consecutiveSamples: 3,
      })
    ).toBe(true);
  });

  it("raises on a single sample when that is the configured run", () => {
    expect(shouldRaiseSignal([starved()], { consecutiveSamples: 1 })).toBe(true);
  });
});

describe("worstSeverity", () => {
  const of = (severity: StarvationAssessment["severity"]): StarvationAssessment => ({
    queueName: "q",
    severity,
    reason: "",
    depth: 0,
    oldestAgeMs: 0,
    processedInWindow: 0,
    activeConsumers: 0,
  });

  it("surfaces starvation over anything else", () => {
    expect(worstSeverity([of("healthy"), of("degraded"), of("starved")])).toBe("starved");
  });

  it("surfaces degraded over healthy", () => {
    expect(worstSeverity([of("healthy"), of("degraded")])).toBe("degraded");
  });

  it("is healthy when everything is", () => {
    expect(worstSeverity([of("healthy"), of("healthy")])).toBe("healthy");
  });

  it("is healthy for an empty set", () => {
    expect(worstSeverity([])).toBe("healthy");
  });
});
