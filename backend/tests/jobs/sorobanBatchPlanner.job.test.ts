import { describe, it, expect, vi } from "vitest";

vi.mock("../../src/utils/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SorobanBatchPlanner, type ResourceEstimate } from "../../src/services/sorobanBatchPlanner.service.js";
import { runSorobanBatchPlannerCycle, getSorobanBatchPlannerStatus, dryRunSubmit } from "../../src/jobs/sorobanBatchPlanner.job.js";

const BUDGET = { maxCpuInstructions: 1_000, maxMemoryBytes: 1_000, maxFootprintEntries: 10, maxFeeStroops: 1_000 };

function estimateOf(cost: Partial<ResourceEstimate>): ResourceEstimate {
  return { cpuInstructions: 10, memoryBytes: 10, footprintEntries: 1, feeStroops: 10, ...cost };
}

function makePlanner(estimate = vi.fn(async () => estimateOf({}))) {
  return new SorobanBatchPlanner(BUDGET, { estimate });
}

function item(id: string) {
  return { id, idempotencyKey: `key-${id}`, contractId: "CBRIDGE", functionName: "submit_health_batch", args: [] };
}

describe("runSorobanBatchPlannerCycle", () => {
  it("plans, dry-run submits, and reconciles a batch end to end", async () => {
    const planner = makePlanner();
    const report = await runSorobanBatchPlannerCycle([item("a"), item("b")], { planner });

    expect(report.plannedItems).toBe(2);
    expect(report.confirmedItems.sort()).toEqual(["a", "b"]);
    expect(report.rescheduledItems).toEqual([]);
    expect(report.deadLetteredItems).toEqual([]);
    expect(report.rejectedItems).toEqual([]);
  });

  it("defaults to a dry-run submitter that never sends a real transaction", async () => {
    const outcomes = await dryRunSubmit({
      batchId: "b1",
      items: [{ ...item("x"), state: "submitted", attempts: 0, estimate: estimateOf({}) } as never],
      totalEstimate: estimateOf({}),
      nonceRange: { start: 0, end: 0 },
    });

    expect(outcomes).toEqual([{ id: "x", success: true, actualUsage: estimateOf({}) }]);
  });

  it("treats a throwing submitter as a whole-batch failure and still reconciles every item", async () => {
    const planner = makePlanner();
    const submit = vi.fn(async () => {
      throw new Error("rpc unavailable");
    });

    const report = await runSorobanBatchPlannerCycle([item("a")], { planner, submit });

    expect(report.rescheduledItems).toEqual(["a"]);
    expect(report.explanations["a"]).toMatch(/rpc unavailable/);
  });

  it("surfaces rejected items that exceed the budget alone, without touching the batches", async () => {
    const planner = makePlanner(vi.fn(async () => estimateOf({ cpuInstructions: 5_000 })));
    const report = await runSorobanBatchPlannerCycle([item("too-big")], { planner });

    expect(report.plannedBatches).toBe(0);
    expect(report.rejectedItems).toEqual([{ id: "too-big", reason: expect.stringMatching(/exceeds configured budget/) }]);
  });
});

describe("getSorobanBatchPlannerStatus", () => {
  it("summarizes the durable lifecycle ledger by state", async () => {
    const planner = makePlanner();
    await runSorobanBatchPlannerCycle([item("a"), item("b")], { planner });

    const status = getSorobanBatchPlannerStatus(planner);
    expect(status.totalItems).toBe(2);
    expect(status.byState).toEqual({ confirmed: 2 });
  });
});
