import { describe, it, expect, vi } from "vitest";
import {
  SorobanBatchPlanner,
  type BatchItemInput,
  type ResourceBudget,
  type ResourceEstimate,
} from "../../src/services/sorobanBatchPlanner.service.js";

const BUDGET: ResourceBudget = {
  maxCpuInstructions: 1_000,
  maxMemoryBytes: 1_000,
  maxFootprintEntries: 10,
  maxFeeStroops: 1_000,
};

function item(id: string, overrides: Partial<BatchItemInput> = {}): BatchItemInput {
  return {
    id,
    idempotencyKey: `key-${id}`,
    contractId: "CBRIDGE",
    functionName: "submit_transfer",
    args: [],
    ...overrides,
  };
}

function estimateOf(cost: Partial<ResourceEstimate>): ResourceEstimate {
  return { cpuInstructions: 0, memoryBytes: 0, footprintEntries: 0, feeStroops: 0, ...cost };
}

describe("SorobanBatchPlanner.plan", () => {
  it("packs items into batches that respect every configured ceiling", async () => {
    const estimate = vi.fn(async () => estimateOf({ cpuInstructions: 400, memoryBytes: 100, footprintEntries: 2, feeStroops: 100 }));
    const planner = new SorobanBatchPlanner(BUDGET, { estimate });

    const inputs = Array.from({ length: 5 }, (_, i) => item(`t${i}`));
    const { batches, rejected } = await planner.plan(inputs);

    expect(rejected).toEqual([]);
    const totalItems = batches.reduce((sum, b) => sum + b.items.length, 0);
    expect(totalItems).toBe(5);

    for (const batch of batches) {
      expect(batch.totalEstimate.cpuInstructions).toBeLessThanOrEqual(BUDGET.maxCpuInstructions);
      expect(batch.totalEstimate.memoryBytes).toBeLessThanOrEqual(BUDGET.maxMemoryBytes);
      expect(batch.totalEstimate.footprintEntries).toBeLessThanOrEqual(BUDGET.maxFootprintEntries);
      expect(batch.totalEstimate.feeStroops).toBeLessThanOrEqual(BUDGET.maxFeeStroops);
      // 400 cpu per item means at most 2 fit per batch under a 1000 ceiling
      expect(batch.items.length).toBeLessThanOrEqual(2);
    }
  });

  it("reserves a contiguous, non-overlapping nonce/order slot per planned item", async () => {
    const estimate = vi.fn(async () => estimateOf({ cpuInstructions: 50, memoryBytes: 50, footprintEntries: 1, feeStroops: 10 }));
    const planner = new SorobanBatchPlanner(BUDGET, { estimate, nonceStart: 5 });

    const inputs = Array.from({ length: 4 }, (_, i) => item(`t${i}`));
    const { batches } = await planner.plan(inputs);

    const nonces = batches.flatMap((b) => b.items.map((i) => i.nonce));
    expect(new Set(nonces).size).toBe(nonces.length);
    expect(Math.min(...(nonces as number[]))).toBe(5);
  });

  it("rejects items whose estimate alone exceeds a budget ceiling, with an explanation", async () => {
    const estimate = vi.fn(async () => estimateOf({ cpuInstructions: 5_000 }));
    const planner = new SorobanBatchPlanner(BUDGET, { estimate });

    const { batches, rejected } = await planner.plan([item("too-big")]);

    expect(batches).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/exceeds configured budget/);
  });

  it("deduplicates by idempotency key so a confirmed item is never re-planned", async () => {
    const estimate = vi.fn(async () => estimateOf({ cpuInstructions: 10 }));
    const planner = new SorobanBatchPlanner(BUDGET, { estimate });

    const input = item("dup");
    const first = await planner.plan([input]);
    planner.markSubmitted(first.batches[0]);
    planner.reconcile(first.batches[0], [{ id: "dup", success: true, actualUsage: estimateOf({ cpuInstructions: 10 }) }]);

    const second = await planner.plan([input]);
    expect(second.batches).toEqual([]);
    expect(second.rejected).toEqual([]);
    expect(estimate).toHaveBeenCalledTimes(1);
  });
});

describe("SorobanBatchPlanner.reconcile", () => {
  it("preserves successful results and explains rejected items on partial batch failure", async () => {
    const estimate = vi.fn(async () => estimateOf({ cpuInstructions: 10 }));
    const planner = new SorobanBatchPlanner(BUDGET, { estimate, maxRetries: 1 });

    const { batches } = await planner.plan([item("ok"), item("bad")]);
    const batch = batches[0];
    planner.markSubmitted(batch);

    const result = planner.reconcile(batch, [
      { id: "ok", success: true, actualUsage: estimateOf({ cpuInstructions: 10 }) },
      { id: "bad", success: false, error: "footprint conflict" },
    ]);

    expect(result.confirmed.map((i) => i.id)).toEqual(["ok"]);
    expect(result.deadLettered.map((i) => i.id)).toEqual(["bad"]);
    expect(result.explanations.get("bad")).toMatch(/footprint conflict/);
    expect(planner.getItem("key-ok")?.state).toBe("confirmed");
    expect(planner.getItem("key-bad")?.state).toBe("dead_letter");
  });

  it("retries failed items with bounded adaptation instead of dead-lettering immediately", async () => {
    const estimate = vi.fn(async () => estimateOf({ cpuInstructions: 100 }));
    const planner = new SorobanBatchPlanner(BUDGET, { estimate, maxRetries: 3, adaptationStep: 2, maxAdaptationFactor: 3 });

    const { batches } = await planner.plan([item("flaky")]);
    let batch = batches[0];
    planner.markSubmitted(batch);

    const first = planner.reconcile(batch, [{ id: "flaky", success: false, error: "resource limit exceeded" }]);
    expect(first.rescheduled.map((i) => i.id)).toEqual(["flaky"]);
    expect(planner.getItem("key-flaky")?.state).toBe("retry_scheduled");
    expect(planner.getItem("key-flaky")?.attempts).toBe(1);

    // Re-plan the retry; the adaptation factor should have widened the estimate.
    const replanned = await planner.plan(planner.itemsPendingRetry());
    expect(estimate).toHaveBeenCalledTimes(2);
    expect(replanned.batches[0].items[0].estimate!.cpuInstructions).toBe(200); // 100 * adaptationStep(2)

    batch = replanned.batches[0];
    planner.markSubmitted(batch);
    const second = planner.reconcile(batch, [{ id: "flaky", success: false, error: "resource limit exceeded" }]);
    expect(second.rescheduled.map((i) => i.id)).toEqual(["flaky"]);
    expect(planner.getItem("key-flaky")?.attempts).toBe(2);

    // Reconciling the same batch again is a no-op: idempotent reconciliation, no duplicate attempt increments.
    const duplicateReconcile = planner.reconcile(batch, [{ id: "flaky", success: false, error: "resource limit exceeded" }]);
    expect(duplicateReconcile.rescheduled).toEqual([]);
    expect(duplicateReconcile.deadLettered).toEqual([]);
    expect(planner.getItem("key-flaky")?.attempts).toBe(2);

    // Adaptation factor is capped: raw 100 * step(2) * step(2) = 400 would exceed maxAdaptationFactor(3) -> clamps to 3x = 300.
    const secondReplan = await planner.plan(planner.itemsPendingRetry());
    expect(secondReplan.batches[0].items[0].estimate!.cpuInstructions).toBe(300);
  });

  it("dead-letters an item after exhausting maxRetries and never re-plans it", async () => {
    const estimate = vi.fn(async () => estimateOf({ cpuInstructions: 10 }));
    const planner = new SorobanBatchPlanner(BUDGET, { estimate, maxRetries: 2 });

    let { batches } = await planner.plan([item("always-fails")]);
    planner.markSubmitted(batches[0]);
    planner.reconcile(batches[0], [{ id: "always-fails", success: false, error: "boom" }]);

    const retryInputs = planner.itemsPendingRetry();
    expect(retryInputs).toHaveLength(1);
    ({ batches } = await planner.plan(retryInputs));
    planner.markSubmitted(batches[0]);
    const finalResult = planner.reconcile(batches[0], [{ id: "always-fails", success: false, error: "boom" }]);

    expect(finalResult.deadLettered.map((i) => i.id)).toEqual(["always-fails"]);
    expect(planner.itemsPendingRetry()).toEqual([]);
  });
});

describe("SorobanBatchPlanner throughput under budget pressure", () => {
  it("packs a large backlog efficiently within tight ceilings (load smoke test)", async () => {
    const tightBudget: ResourceBudget = {
      maxCpuInstructions: 500,
      maxMemoryBytes: 500,
      maxFootprintEntries: 5,
      maxFeeStroops: 500,
      maxBatchSize: 20,
    };

    const estimate = vi.fn(async () => estimateOf({ cpuInstructions: 50, memoryBytes: 50, footprintEntries: 1, feeStroops: 20 }));
    const planner = new SorobanBatchPlanner(tightBudget, { estimate });

    const backlogSize = 500;
    const inputs = Array.from({ length: backlogSize }, (_, i) => item(`load-${i}`));

    const startedAt = Date.now();
    const { batches, rejected } = await planner.plan(inputs);
    const elapsedMs = Date.now() - startedAt;

    const totalPlanned = batches.reduce((sum, b) => sum + b.items.length, 0);
    expect(rejected).toEqual([]);
    expect(totalPlanned).toBe(backlogSize);
    // footprintEntries is the binding constraint: 1 entry/item under a 5-entry ceiling -> 5 items/batch optimum.
    expect(batches.length).toBe(backlogSize / 5);
    expect(elapsedMs).toBeLessThan(2_000);
  });
});
