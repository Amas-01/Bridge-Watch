import { QUEUE_NAME, JobQueue } from "../workers/queue.js";

const PRIORITIES = ["critical", "high", "medium", "low"] as const;

function count(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getWorkerCapacityMetrics() {
  const queue = JobQueue.getInstance();
  const counts = await queue.getJobCounts();
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

  return PRIORITIES.map((priority) => {
    const queueName = `${QUEUE_NAME}-${priority}`;
    const queueCounts = counts[queueName] ?? {};
    const active = count(queueCounts.active);
    const waiting = count(queueCounts.waiting) + count(queueCounts.delayed) + count(queueCounts.paused);
    const failed = count(queueCounts.failed);
    const completed = count(queueCounts.completed);
    const utilization = concurrency <= 0 ? 0 : Math.min(1, active / concurrency);
    const backlogPressure = concurrency <= 0 ? waiting : waiting / concurrency;

    return {
      queue: queueName,
      priority,
      concurrency,
      active,
      waiting,
      failed,
      completed,
      capacityUtilization: Number(utilization.toFixed(4)),
      backlogPressure: Number(backlogPressure.toFixed(2)),
      recommendedWorkers: Math.max(1, Math.ceil((active + waiting) / Math.max(1, concurrency))),
    };
  });
}
