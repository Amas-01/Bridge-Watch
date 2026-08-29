import type { BackfillTask, BackfillDAG } from "./types.js";

/**
 * Builds a Directed Acyclic Graph from a set of backfill tasks.
 * Validates that the dependency graph is acyclic and all dependency
 * references resolve to existing tasks.
 */
export function buildDAG(tasks: BackfillTask[]): BackfillDAG {
  const taskMap = new Map<string, BackfillTask>();
  const adjacency = new Map<string, Set<string>>();
  const reverseAdjacency = new Map<string, Set<string>>();

  for (const task of tasks) {
    if (taskMap.has(task.id)) {
      throw new Error(`Duplicate task ID: ${task.id}`);
    }
    taskMap.set(task.id, task);
    if (!adjacency.has(task.id)) {
      adjacency.set(task.id, new Set());
    }
    if (!reverseAdjacency.has(task.id)) {
      reverseAdjacency.set(task.id, new Set());
    }
  }

  for (const task of tasks) {
    for (const depId of task.dependencies) {
      if (!taskMap.has(depId)) {
        throw new Error(
          `Task "${task.id}" depends on unknown task "${depId}"`
        );
      }
      adjacency.get(depId)!.add(task.id);
      reverseAdjacency.get(task.id)!.add(depId);
    }
  }

  validateAcyclic(taskMap, adjacency);

  return { tasks: taskMap, adjacency, reverseAdjacency };
}

/**
 * Topological sort of tasks respecting dependencies.
 * Returns tasks in execution order (roots first).
 */
export function topologicalSort(dag: BackfillDAG): string[] {
  const inDegree = new Map<string, number>();
  for (const [id] of dag.tasks) {
    inDegree.set(id, dag.reverseAdjacency.get(id)?.size ?? 0);
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of dag.adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  if (sorted.length !== dag.tasks.size) {
    throw new Error("Cycle detected in dependency graph");
  }

  return sorted;
}

/**
 * Returns all tasks that are ready to execute (all dependencies completed).
 */
export function getReadyTasks(
  dag: BackfillDAG,
  completedTasks: Set<string>
): BackfillTask[] {
  const ready: BackfillTask[] = [];

  for (const [id, task] of dag.tasks) {
    if (completedTasks.has(id)) continue;

    const deps = dag.reverseAdjacency.get(id) ?? new Set();
    const allDepsCompleted = [...deps].every((dep) => completedTasks.has(dep));

    if (allDepsCompleted) {
      ready.push(task);
    }
  }

  return ready.sort((a, b) => b.priority - a.priority);
}

/**
 * Estimates the critical path length (longest dependency chain).
 */
export function criticalPathLength(dag: BackfillDAG): number {
  const memo = new Map<string, number>();

  function dfs(id: string): number {
    if (memo.has(id)) return memo.get(id)!;

    const neighbors = dag.adjacency.get(id) ?? new Set();
    if (neighbors.size === 0) {
      memo.set(id, 1);
      return 1;
    }

    let maxChild = 0;
    for (const neighbor of neighbors) {
      maxChild = Math.max(maxChild, dfs(neighbor));
    }

    const length = 1 + maxChild;
    memo.set(id, length);
    return length;
  }

  let maxPath = 0;
  for (const [id] of dag.tasks) {
    maxPath = Math.max(maxPath, dfs(id));
  }

  return maxPath;
}

function validateAcyclic(
  tasks: Map<string, unknown>,
  adjacency: Map<string, Set<string>>
): void {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();

  for (const [id] of tasks) {
    color.set(id, WHITE);
  }

  function dfs(node: string): void {
    color.set(node, GRAY);

    for (const neighbor of adjacency.get(node) ?? []) {
      const neighborColor = color.get(neighbor) ?? WHITE;
      if (neighborColor === GRAY) {
        throw new Error(`Cycle detected involving task "${node}" → "${neighbor}"`);
      }
      if (neighborColor === WHITE) {
        dfs(neighbor);
      }
    }

    color.set(node, BLACK);
  }

  for (const [id] of tasks) {
    if (color.get(id) === WHITE) {
      dfs(id);
    }
  }
}
