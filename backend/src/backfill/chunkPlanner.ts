import type { BackfillTask } from "./types.js";

export interface ChunkPlan {
  task: BackfillTask;
  chunkIndex: number;
  from: number;
  to: number;
}

export interface ChunkPlanResult {
  chunks: ChunkPlan[];
  totalRangeUnits: number;
}

/**
 * Splits a task's range into fixed-size chunks.
 * Chunks are non-overlapping and cover the full range.
 */
export function planTaskChunks(
  task: BackfillTask,
  chunkSize: number
): ChunkPlanResult {
  if (chunkSize <= 0) {
    throw new Error(`Chunk size must be positive, got ${chunkSize}`);
  }

  if (task.to <= task.from) {
    throw new Error(
      `Invalid range for task "${task.id}": from=${task.from} to=${task.to}`
    );
  }

  const chunks: ChunkPlan[] = [];
  let index = 0;

  for (let from = task.from; from < task.to; from += chunkSize) {
    chunks.push({
      task,
      chunkIndex: index,
      from,
      to: Math.min(from + chunkSize, task.to),
    });
    index++;
  }

  return {
    chunks,
    totalRangeUnits: task.to - task.from,
  };
}

/**
 * Plans chunks for all tasks in a DAG, respecting finality requirements.
 * Adds a finality buffer to each task's range end to account for
 * chain finality delays.
 */
export function planAllTaskChunks(
  tasks: BackfillTask[],
  chunkSize: number,
  finalityBufferMultiplier = 1
): Map<string, ChunkPlanResult> {
  const results = new Map<string, ChunkPlanResult>();

  for (const task of tasks) {
    const bufferedTask: BackfillTask = {
      ...task,
      from: task.from,
      to: task.to + Math.ceil(task.finalityRequirement * finalityBufferMultiplier),
    };

    results.set(task.id, planTaskChunks(bufferedTask, chunkSize));
  }

  return results;
}
