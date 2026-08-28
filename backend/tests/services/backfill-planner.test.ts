import { describe, it, expect } from "vitest";
import {
  buildDAG,
  topologicalSort,
  getReadyTasks,
  criticalPathLength,
} from "../../src/backfill/planner.js";
import { planTaskChunks, planAllTaskChunks } from "../../src/backfill/chunkPlanner.js";
import { CapacityReservation } from "../../src/backfill/capacityReservation.js";
import {
  validateCompleteness,
  verifyOutput,
  detectProviderLimits,
} from "../../src/backfill/validation.js";
import {
  createBackfillPlan,
  explainPlan,
  checkCompleteness,
} from "../../src/backfill/orchestrator.js";
import { BackfillScheduler, LeaseManager } from "../../src/backfill/scheduler.js";
import type { BackfillTask, ScheduledChunk } from "../../src/backfill/types.js";

const sampleTasks: BackfillTask[] = [
  {
    id: "prices",
    sourceType: "horizon",
    from: 1000,
    to: 2000,
    dependencies: [],
    finalityRequirement: 10,
    priority: 1,
  },
  {
    id: "health",
    sourceType: "aggregation",
    from: 1000,
    to: 2000,
    dependencies: ["prices"],
    finalityRequirement: 5,
    priority: 2,
  },
  {
    id: "alerts",
    sourceType: "rule-eval",
    from: 1000,
    to: 2000,
    dependencies: ["prices", "health"],
    finalityRequirement: 0,
    priority: 3,
  },
];

describe("DAG Builder", () => {
  it("builds a valid DAG from tasks", () => {
    const dag = buildDAG(sampleTasks);

    expect(dag.tasks.size).toBe(3);
    expect(dag.adjacency.get("prices")?.has("health")).toBe(true);
    expect(dag.adjacency.get("prices")?.has("alerts")).toBe(true);
    expect(dag.adjacency.get("health")?.has("alerts")).toBe(true);
  });

  it("throws on duplicate task IDs", () => {
    const dupes: BackfillTask[] = [
      { ...sampleTasks[0], id: "prices" },
      { ...sampleTasks[0], id: "prices" },
    ];
    expect(() => buildDAG(dupes)).toThrow("Duplicate task ID");
  });

  it("throws on unknown dependency", () => {
    const bad: BackfillTask[] = [
      { ...sampleTasks[0], dependencies: ["nonexistent"] },
    ];
    expect(() => buildDAG(bad)).toThrow("unknown task");
  });

  it("throws on cyclic dependencies", () => {
    const cyclic: BackfillTask[] = [
      { id: "a", sourceType: "x", from: 0, to: 10, dependencies: ["b"], finalityRequirement: 0, priority: 1 },
      { id: "b", sourceType: "x", from: 0, to: 10, dependencies: ["a"], finalityRequirement: 0, priority: 1 },
    ];
    expect(() => buildDAG(cyclic)).toThrow("Cycle detected");
  });
});

describe("Topological Sort", () => {
  it("sorts tasks in dependency order", () => {
    const dag = buildDAG(sampleTasks);
    const order = topologicalSort(dag);

    expect(order.indexOf("prices")).toBeLessThan(order.indexOf("health"));
    expect(order.indexOf("health")).toBeLessThan(order.indexOf("alerts"));
  });

  it("handles tasks with no dependencies", () => {
    const standalone: BackfillTask[] = [
      { id: "x", sourceType: "a", from: 0, to: 10, dependencies: [], finalityRequirement: 0, priority: 1 },
      { id: "y", sourceType: "b", from: 0, to: 10, dependencies: [], finalityRequirement: 0, priority: 1 },
    ];
    const dag = buildDAG(standalone);
    const order = topologicalSort(dag);

    expect(order).toHaveLength(2);
    expect(order).toContain("x");
    expect(order).toContain("y");
  });
});

describe("Get Ready Tasks", () => {
  it("returns root tasks when no tasks completed", () => {
    const dag = buildDAG(sampleTasks);
    const ready = getReadyTasks(dag, new Set());

    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("prices");
  });

  it("returns dependent tasks after deps complete", () => {
    const dag = buildDAG(sampleTasks);
    const ready = getReadyTasks(dag, new Set(["prices"]));

    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("health");
  });

  it("returns all remaining when all deps met", () => {
    const dag = buildDAG(sampleTasks);
    const ready = getReadyTasks(dag, new Set(["prices", "health"]));

    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe("alerts");
  });
});

describe("Critical Path", () => {
  it("computes the longest dependency chain", () => {
    const dag = buildDAG(sampleTasks);
    expect(criticalPathLength(dag)).toBe(3);
  });
});

describe("Chunk Planner", () => {
  it("splits a range into fixed-size chunks", () => {
    const task: BackfillTask = {
      id: "test",
      sourceType: "x",
      from: 0,
      to: 100,
      dependencies: [],
      finalityRequirement: 0,
      priority: 1,
    };

    const result = planTaskChunks(task, 30);

    expect(result.chunks).toHaveLength(4);
    expect(result.chunks[0].from).toBe(0);
    expect(result.chunks[0].to).toBe(30);
    expect(result.chunks[3].from).toBe(90);
    expect(result.chunks[3].to).toBe(100);
    expect(result.totalRangeUnits).toBe(100);
  });

  it("throws on zero chunk size", () => {
    const task: BackfillTask = {
      id: "test",
      sourceType: "x",
      from: 0,
      to: 100,
      dependencies: [],
      finalityRequirement: 0,
      priority: 1,
    };

    expect(() => planTaskChunks(task, 0)).toThrow("positive");
  });

  it("adds finality buffer to range end", () => {
    const tasks: BackfillTask[] = [
      { id: "a", sourceType: "x", from: 0, to: 100, dependencies: [], finalityRequirement: 10, priority: 1 },
    ];

    const results = planAllTaskChunks(tasks, 50, 2);
    const chunks = results.get("a")!.chunks;

    expect(chunks.length).toBeGreaterThan(0);
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.to).toBeGreaterThanOrEqual(120);
  });
});

describe("Capacity Reservation", () => {
  it("acquires tokens within budget", () => {
    const cap = new CapacityReservation(100, 70);

    expect(cap.tryAcquire(30)).toBe(true);
    expect(cap.availableTokens()).toBeLessThanOrEqual(0);
  });

  it("rejects when budget exceeded", () => {
    const cap = new CapacityReservation(100, 70);

    expect(cap.tryAcquire(31)).toBe(false);
  });

  it("releases tokens back", () => {
    const cap = new CapacityReservation(100, 70);

    cap.tryAcquire(20);
    cap.release(20);
    expect(cap.availableTokens()).toBeGreaterThanOrEqual(29);
  });

  it("throws when reserved exceeds total", () => {
    expect(() => new CapacityReservation(50, 100)).toThrow("exceeds total");
  });

  it("reports budget correctly", () => {
    const cap = new CapacityReservation(1000, 800);
    const budget = cap.getBudget();

    expect(budget.totalRatePerSecond).toBe(1000);
    expect(budget.reservedForLive).toBe(800);
    expect(budget.availableForBackfill).toBe(200);
  });
});

describe("Completeness Validation", () => {
  it("reports complete when all ranges covered", () => {
    const report = validateCompleteness(
      [{ from: 0, to: 100 }],
      [{ from: 0, to: 100 }]
    );

    expect(report.isComplete).toBe(true);
    expect(report.missingRanges).toHaveLength(0);
  });

  it("detects missing middle range", () => {
    const report = validateCompleteness(
      [{ from: 0, to: 100 }],
      [{ from: 0, to: 50 }, { from: 60, to: 100 }]
    );

    expect(report.isComplete).toBe(false);
    expect(report.missingRanges).toEqual([{ from: 50, to: 60 }]);
  });

  it("detects missing prefix", () => {
    const report = validateCompleteness(
      [{ from: 0, to: 100 }],
      [{ from: 20, to: 100 }]
    );

    expect(report.isComplete).toBe(false);
    expect(report.missingRanges).toEqual([{ from: 0, to: 20 }]);
  });

  it("handles empty expected ranges", () => {
    const report = validateCompleteness([], []);
    expect(report.isComplete).toBe(true);
  });
});

describe("Output Verification", () => {
  it("reports match for identical checksums", () => {
    const result = verifyOutput("task-1", "abc123", "abc123");
    expect(result.match).toBe(true);
    expect(result.differences).toBeUndefined();
  });

  it("reports mismatch for different checksums", () => {
    const result = verifyOutput("task-1", "abc123", "def456");
    expect(result.match).toBe(false);
    expect(result.differences).toHaveLength(1);
  });
});

describe("Provider Limit Detection", () => {
  it("detects rate limit failures", () => {
    const results = [
      { from: 0, to: 100, success: true },
      { from: 100, to: 200, success: true },
      { from: 200, to: 300, success: false, error: "rate limit exceeded" },
    ];

    const limits = detectProviderLimits(results);
    expect(limits.failurePatterns.length).toBeGreaterThan(0);
    expect(limits.recommendedDelay).toBeGreaterThan(0);
  });

  it("recommends no delay when failures are low", () => {
    const results = [
      { from: 0, to: 100, success: true },
      { from: 100, to: 200, success: true },
      { from: 200, to: 300, success: true },
    ];

    const limits = detectProviderLimits(results);
    expect(limits.recommendedDelay).toBe(0);
  });
});

describe("Backfill Orchestrator", () => {
  it("creates a complete plan with DAG and scheduler", () => {
    const result = createBackfillPlan(sampleTasks, {
      chunkSize: 100,
      totalRatePerSecond: 50,
      reservedForLive: 30,
    });

    expect(result.plan.id).toBeDefined();
    expect(result.dag.tasks.size).toBe(3);
    expect(result.plan.scheduledChunks.length).toBeGreaterThan(0);
    expect(result.capacity.getBudget().availableForBackfill).toBe(20);
  });

  it("produces an explainable plan", () => {
    const result = createBackfillPlan(sampleTasks, {
      chunkSize: 500,
      totalRatePerSecond: 100,
      reservedForLive: 60,
    });

    const explanation = explainPlan(result);
    expect(explanation).toContain("Backfill Plan");
    expect(explanation).toContain("prices");
    expect(explanation).toContain("health");
    expect(explanation).toContain("alerts");
  });

  it("checks completeness against completed chunks", () => {
    const result = createBackfillPlan(sampleTasks, {
      chunkSize: 500,
      totalRatePerSecond: 50,
      reservedForLive: 30,
    });

    const allPricesChunks = result.plan.scheduledChunks.filter(
      (c) => c.taskId === "prices"
    );
    // Mark only the first chunk as completed
    if (allPricesChunks.length > 0) {
      allPricesChunks[0].status = "completed";
    }

    const report = checkCompleteness(sampleTasks, allPricesChunks.filter(c => c.status === "completed"));
    expect(report.isComplete).toBe(false);
    expect(report.missingRanges.length).toBeGreaterThan(0);
  });
});

describe("Scheduler", () => {
  it("returns eligible chunks", () => {
    const chunks: ScheduledChunk[] = [
      { taskId: "a", chunkIndex: 0, from: 0, to: 100, status: "pending", attempts: 0, maxAttempts: 3 },
      { taskId: "a", chunkIndex: 1, from: 100, to: 200, status: "completed", attempts: 1, maxAttempts: 3 },
    ];

    const scheduler = new BackfillScheduler(chunks);
    const eligible = scheduler.getEligibleChunks(10);

    expect(eligible).toHaveLength(1);
    expect(eligible[0].chunkIndex).toBe(0);
  });

  it("leases and tracks chunks", () => {
    const chunks: ScheduledChunk[] = [
      { taskId: "a", chunkIndex: 0, from: 0, to: 100, status: "pending", attempts: 0, maxAttempts: 3 },
    ];

    const scheduler = new BackfillScheduler(chunks);
    const leaseId = scheduler.leaseChunk(chunks[0]);

    expect(leaseId).toBeDefined();
    expect(scheduler.getProgress().running).toBe(1);
  });

  it("tracks progress correctly", () => {
    const chunks: ScheduledChunk[] = [
      { taskId: "a", chunkIndex: 0, from: 0, to: 100, status: "completed", attempts: 1, maxAttempts: 3 },
      { taskId: "a", chunkIndex: 1, from: 100, to: 200, status: "failed", attempts: 3, maxAttempts: 3 },
      { taskId: "a", chunkIndex: 2, from: 200, to: 300, status: "pending", attempts: 0, maxAttempts: 3 },
    ];

    const scheduler = new BackfillScheduler(chunks);
    const progress = scheduler.getProgress();

    expect(progress.total).toBe(3);
    expect(progress.completed).toBe(1);
    expect(progress.failed).toBe(1);
    expect(progress.pending).toBe(1);
    expect(progress.percent).toBe(33);
  });

  it("pause and resume works", () => {
    const chunks: ScheduledChunk[] = [
      { taskId: "a", chunkIndex: 0, from: 0, to: 100, status: "running", attempts: 1, maxAttempts: 3 },
    ];

    const scheduler = new BackfillScheduler(chunks);
    scheduler.pauseAll();
    expect(scheduler.getProgress().paused).toBe(1);

    scheduler.resumeAll();
    expect(scheduler.getProgress().pending).toBe(1);
  });

  it("failed chunk retries then marks as failed", () => {
    const chunk: ScheduledChunk = {
      taskId: "a",
      chunkIndex: 0,
      from: 0,
      to: 100,
      status: "running",
      attempts: 2,
      maxAttempts: 3,
    };

    const scheduler = new BackfillScheduler([chunk]);
    scheduler.markFailed(chunk);

    expect(chunk.status).toBe("failed");
    expect(chunk.attempts).toBe(3);
  });
});

describe("Lease Manager", () => {
  it("acquires and releases leases", () => {
    const lm = new LeaseManager();
    const chunk: ScheduledChunk = {
      taskId: "a",
      chunkIndex: 0,
      from: 0,
      to: 100,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
    };

    const leaseId = lm.acquireLease(chunk);
    expect(leaseId).toBeDefined();
    expect(lm.isLeased("a", 0)).toBe(true);

    lm.releaseLease("a", 0);
    expect(lm.isLeased("a", 0)).toBe(false);
  });

  it("rejects double lease", () => {
    const lm = new LeaseManager();
    const chunk: ScheduledChunk = {
      taskId: "a",
      chunkIndex: 0,
      from: 0,
      to: 100,
      status: "pending",
      attempts: 0,
      maxAttempts: 3,
    };

    lm.acquireLease(chunk);
    expect(() => lm.acquireLease(chunk)).toThrow("already leased");
  });
});
