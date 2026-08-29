import { describe, it, expect, beforeEach } from "vitest";
import {
  VolumeAnomalyReviewQueueService,
  type VolumeAnomalyInput,
} from "../../src/services/volumeAnomalyReviewQueue.service.js";

describe("VolumeAnomalyReviewQueueService (#1136)", () => {
  let service: VolumeAnomalyReviewQueueService;
  const T0 = 1_000_000_000_000;

  beforeEach(() => {
    service = new VolumeAnomalyReviewQueueService();
  });

  const anomaly = (over: Partial<VolumeAnomalyInput>): VolumeAnomalyInput => ({
    anomalyId: `an_${Math.random().toString(36).slice(2)}`,
    assetCode: "USDC",
    chain: "stellar",
    severity: "high",
    observedVolumeUsd: 5_000_000,
    baselineVolumeUsd: 1_000_000,
    ...over,
  });

  it("enqueues with derived deviation, priority and SLA; dedupes on anomalyId", () => {
    const item = service.enqueue(anomaly({ anomalyId: "an_1", severity: "high" }), T0);

    expect(item.status).toBe("pending");
    expect(item.deviationPct).toBe(400); // (5M - 1M) / 1M * 100
    expect(item.priority).toBe(1); // high (2) lifted by the >=300% deviation
    expect(new Date(item.slaDueAt).getTime()).toBe(T0 + 4 * 60 * 60 * 1000);

    const dup = service.enqueue(anomaly({ anomalyId: "an_1", severity: "low" }), T0 + 5);
    expect(dup.id).toBe(item.id);
    expect(dup.severity).toBe("high"); // original wins
  });

  it("validates input", () => {
    expect(() => service.enqueue(anomaly({ anomalyId: "" }))).toThrow();
    // @ts-expect-error bad severity
    expect(() => service.enqueue(anomaly({ severity: "extreme" }))).toThrow(/severity/);
    expect(() => service.enqueue(anomaly({ observedVolumeUsd: -1 }))).toThrow(/observedVolumeUsd/);
  });

  it("walks the triage lifecycle and records history", () => {
    const item = service.enqueue(anomaly({ anomalyId: "an_1" }), T0);

    service.assign(item.id, "alice", "alice", T0 + 1_000);
    expect(service.getItem(item.id)?.status).toBe("in_review");
    expect(service.getItem(item.id)?.assignee).toBe("alice");

    service.addNote(item.id, "alice", "  correlated with a partner launch  ", T0 + 2_000);
    expect(service.getItem(item.id)?.notes[0].note).toBe("correlated with a partner launch");

    const resolved = service.resolve(
      item.id,
      "alice",
      "benign_spike",
      "expected volume from launch",
      T0 + 3_000,
    );
    expect(resolved.status).toBe("resolved");
    expect(resolved.disposition).toBe("benign_spike");
    expect(resolved.resolvedAt).toBe(new Date(T0 + 3_000).toISOString());

    const actions = resolved.history.map((h) => h.action);
    expect(actions).toEqual(["enqueued", "assigned", "note_added", "resolved"]);

    expect(() =>
      service.resolve(item.id, "alice", "false_positive", "changed my mind", T0 + 4_000),
    ).toThrow(/already resolved/);
  });

  it("reopens a resolved item and clears its disposition", () => {
    const item = service.enqueue(anomaly({ anomalyId: "an_1" }), T0);
    service.assign(item.id, "bob", "bob", T0 + 1);
    service.resolve(item.id, "bob", "false_positive", "detector misfire", T0 + 2);

    const reopened = service.reopen(item.id, "carol", "new data contradicts the call", T0 + 10);
    expect(reopened.status).toBe("in_review"); // had an assignee
    expect(reopened.disposition).toBeNull();
    expect(reopened.resolvedAt).toBeNull();

    expect(() => service.reopen(item.id, "carol", "again", T0 + 20)).toThrow(/resolved items/);
  });

  it("lists by priority, filters, and computes overdue + stats", () => {
    service.enqueue(anomaly({ anomalyId: "low1", severity: "low" }), T0);
    const crit = service.enqueue(anomaly({ anomalyId: "crit1", severity: "critical" }), T0);
    const med = service.enqueue(anomaly({ anomalyId: "med1", severity: "medium" }), T0);

    // Highest priority first.
    const ordered = service.list();
    expect(ordered[0].anomalyId).toBe("crit1");

    // critical SLA is 1h; 2h later it is overdue.
    const twoHoursLater = T0 + 2 * 60 * 60 * 1000;
    expect(service.isOverdue(crit, twoHoursLater)).toBe(true);
    expect(service.list({ overdueOnly: true }, twoHoursLater).map((i) => i.anomalyId)).toContain(
      "crit1",
    );

    service.resolve(med.id, "alice", "confirmed_incident", "real", T0 + 60_000);
    const stats = service.stats(twoHoursLater);
    expect(stats.total).toBe(3);
    expect(stats.byStatus.resolved).toBe(1);
    expect(stats.byStatus.pending).toBe(2);
    expect(stats.bySeverity.critical).toBe(1);
    expect(stats.overdue).toBe(1); // only critical (1h SLA); low has a 72h SLA, medium is resolved
    expect(stats.avgResolutionMs).toBe(60_000);
  });

  it("throws on operations against a missing item", () => {
    expect(() => service.assign("nope", "a", "a")).toThrow(/not found/);
    expect(() => service.addNote("nope", "a", "x")).toThrow(/not found/);
  });
});
