import type {
  BackfillTask,
  BackfillPlan,
  ScheduledChunk,
} from "./types.js";
import { buildDAG, topologicalSort } from "./planner.js";
import type { BackfillDAG } from "./types.js";
import { planAllTaskChunks, type ChunkPlanResult } from "./chunkPlanner.js";
import { BackfillScheduler } from "./scheduler.js";
import { CapacityReservation } from "./capacityReservation.js";
import { validateCompleteness } from "./validation.js";
import type { CompletenessReport } from "./types.js";

export interface BackfillPlannerConfig {
  chunkSize: number;
  totalRatePerSecond: number;
  reservedForLive: number;
  finalityBufferMultiplier?: number;
}

export interface BackfillPlannerResult {
  plan: BackfillPlan;
  dag: BackfillDAG;
  scheduler: BackfillScheduler;
  capacity: CapacityReservation;
  taskChunkPlans: Map<string, ChunkPlanResult>;
}

/**
 * Dependency-aware backfill planner that models source ranges,
 * dependencies, finality requirements, and produces an explainable
 * DAG of work with scheduled chunks.
 */
export function createBackfillPlan(
  tasks: BackfillTask[],
  config: BackfillPlannerConfig
): BackfillPlannerResult {
  const dag = buildDAG(tasks);
  const executionOrder = topologicalSort(dag);

  const orderedTasks = executionOrder
    .map((id) => dag.tasks.get(id)!)
    .sort((a, b) => {
      const aIdx = executionOrder.indexOf(a.id);
      const bIdx = executionOrder.indexOf(b.id);
      return aIdx - bIdx;
    });

  const taskChunkPlans = planAllTaskChunks(
    orderedTasks,
    config.chunkSize,
    config.finalityBufferMultiplier ?? 1
  );

  const allChunks: ScheduledChunk[] = [];
  for (const [taskId, chunkPlan] of taskChunkPlans) {
    for (const cp of chunkPlan.chunks) {
      allChunks.push({
        taskId,
        chunkIndex: cp.chunkIndex,
        from: cp.from,
        to: cp.to,
        status: "pending",
        attempts: 0,
        maxAttempts: 3,
      });
    }
  }

  const scheduler = new BackfillScheduler(allChunks);
  const capacity = new CapacityReservation(
    config.totalRatePerSecond,
    config.reservedForLive
  );

  const plan: BackfillPlan = {
    id: `plan-${Date.now()}`,
    tasks,
    edges: tasks.flatMap((t) =>
      t.dependencies.map((dep) => ({ from: dep, to: t.id }))
    ),
    scheduledChunks: allChunks,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    plan,
    dag,
    scheduler,
    capacity,
    taskChunkPlans,
  };
}

export function explainPlan(
  result: BackfillPlannerResult
): string {
  const lines: string[] = [];
  lines.push("=== Backfill Plan ===");
  lines.push(`Plan ID: ${result.plan.id}`);
  lines.push(`Tasks: ${result.plan.tasks.length}`);
  lines.push(
    `Total chunks: ${result.plan.scheduledChunks.length}`
  );
  lines.push(
    `Critical path length: ${result.dag.tasks.size} tasks`
  );
  lines.push("");

  lines.push("--- Execution Order ---");
  const order = topologicalSort(result.dag);
  for (let i = 0; i < order.length; i++) {
    const task = result.dag.tasks.get(order[i])!;
    const chunkPlan = result.taskChunkPlans.get(task.id);
    lines.push(
      `  ${i + 1}. ${task.id} (from=${task.from}, to=${task.to}, ` +
        `deps=[${task.dependencies.join(", ")}], ` +
        `chunks=${chunkPlan?.chunks.length ?? 0}, ` +
        `priority=${task.priority})`
    );
  }

  lines.push("");
  lines.push("--- Capacity ---");
  const budget = result.capacity.getBudget();
  lines.push(
    `  Total: ${budget.totalRatePerSecond}/s, ` +
      `Reserved for live: ${budget.reservedForLive}/s, ` +
      `Available for backfill: ${budget.availableForBackfill}/s`
  );

  return lines.join("\n");
}

export function checkCompleteness(
  tasks: BackfillTask[],
  completedChunks: ScheduledChunk[]
): CompletenessReport {
  const expectedRanges = tasks.map((t) => ({ from: t.from, to: t.to }));

  const completedRanges = completedChunks
    .filter((c) => c.status === "completed")
    .map((c) => ({ from: c.from, to: c.to }));

  return validateCompleteness(expectedRanges, completedRanges);
}
