import {
  SorobanBatchPlanner,
  createSorobanEstimateFn,
  type BatchItemInput,
  type BatchPlan,
  type PlannerItem,
  type ResourceBudget,
  type SubmissionOutcome,
} from "../services/sorobanBatchPlanner.service.js";
import { SorobanRpcClient } from "../services/stellar/soroban.client.js";
import { logger } from "../utils/logger.js";

const DEFAULT_BUDGET: ResourceBudget = {
  maxCpuInstructions: Number(process.env.SOROBAN_BATCH_MAX_CPU_INSTRUCTIONS) || 40_000_000,
  maxMemoryBytes: Number(process.env.SOROBAN_BATCH_MAX_MEMORY_BYTES) || 40_000_000,
  maxFootprintEntries: Number(process.env.SOROBAN_BATCH_MAX_FOOTPRINT_ENTRIES) || 40,
  maxFeeStroops: Number(process.env.SOROBAN_BATCH_MAX_FEE_STROOPS) || 10_000_000,
  maxBatchSize: Number(process.env.SOROBAN_BATCH_MAX_BATCH_SIZE) || 20,
};

const DEFAULT_MAX_RETRIES = Number(process.env.SOROBAN_BATCH_MAX_RETRIES) || 3;

export type SorobanBatchSubmitter = (batch: BatchPlan) => Promise<SubmissionOutcome[]>;

/**
 * Dry-run submitter: accepts every planned item without sending a real
 * transaction. This is the default so triggering a cycle never risks an
 * unintended on-chain submission; pass a real submitter explicitly to go live.
 */
export const dryRunSubmit: SorobanBatchSubmitter = async (batch) =>
  batch.items.map((item) => ({ id: item.id, success: true, actualUsage: item.estimate }));

let sharedPlanner: SorobanBatchPlanner | null = null;

/** Process-lifetime singleton planner so the lifecycle ledger and nonce sequence persist across cycles. */
export function getSorobanBatchPlanner(): SorobanBatchPlanner {
  if (!sharedPlanner) {
    const client = new SorobanRpcClient();
    sharedPlanner = new SorobanBatchPlanner(DEFAULT_BUDGET, {
      estimate: createSorobanEstimateFn(client, (item) => ({
        contractId: item.contractId,
        functionName: item.functionName,
        args: item.args as never,
      })),
      maxRetries: DEFAULT_MAX_RETRIES,
    });
  }

  return sharedPlanner;
}

export interface SorobanBatchPlannerCycleReport {
  jobId: string;
  startedAt: string;
  finishedAt: string;
  plannedBatches: number;
  plannedItems: number;
  rejectedItems: Array<{ id: string; reason: string }>;
  confirmedItems: string[];
  rescheduledItems: string[];
  deadLetteredItems: string[];
  explanations: Record<string, string>;
}

/**
 * Runs one plan -> submit -> reconcile cycle over the given items. Batches
 * that fail to submit outright (submitter throws) are treated as a full-batch
 * failure so every item still goes through bounded-retry reconciliation
 * instead of being silently dropped.
 */
export async function runSorobanBatchPlannerCycle(
  items: BatchItemInput[],
  options?: { submit?: SorobanBatchSubmitter; planner?: SorobanBatchPlanner }
): Promise<SorobanBatchPlannerCycleReport> {
  const jobId = `soroban-batch-${Date.now()}`;
  const startedAt = new Date().toISOString();
  const planner = options?.planner ?? getSorobanBatchPlanner();
  const submit = options?.submit ?? dryRunSubmit;

  logger.info({ jobId, itemCount: items.length }, "Starting Soroban batch planner cycle");

  const { batches, rejected } = await planner.plan(items);

  const confirmedItems: string[] = [];
  const rescheduledItems: string[] = [];
  const deadLetteredItems: string[] = [];
  const explanations: Record<string, string> = {};

  for (const batch of batches) {
    planner.markSubmitted(batch);

    let outcomes: SubmissionOutcome[];
    try {
      outcomes = await submit(batch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn({ jobId, batchId: batch.batchId, error: message }, "Soroban batch submission failed outright");
      outcomes = batch.items.map((item) => ({ id: item.id, success: false, error: message }));
    }

    const result = planner.reconcile(batch, outcomes);
    confirmedItems.push(...result.confirmed.map((item) => item.id));
    rescheduledItems.push(...result.rescheduled.map((item) => item.id));
    deadLetteredItems.push(...result.deadLettered.map((item) => item.id));
    for (const [id, reason] of result.explanations) {
      explanations[id] = reason;
    }
  }

  const finishedAt = new Date().toISOString();
  logger.info(
    {
      jobId,
      batches: batches.length,
      confirmed: confirmedItems.length,
      rescheduled: rescheduledItems.length,
      deadLettered: deadLetteredItems.length,
      rejected: rejected.length,
    },
    "Completed Soroban batch planner cycle"
  );

  return {
    jobId,
    startedAt,
    finishedAt,
    plannedBatches: batches.length,
    plannedItems: batches.reduce((sum, batch) => sum + batch.items.length, 0),
    rejectedItems: rejected.map(({ item, reason }) => ({ id: item.id, reason })),
    confirmedItems,
    rescheduledItems,
    deadLetteredItems,
    explanations,
  };
}

export interface SorobanBatchPlannerStatus {
  totalItems: number;
  byState: Record<string, number>;
  items: PlannerItem[];
}

export function getSorobanBatchPlannerStatus(planner: SorobanBatchPlanner = getSorobanBatchPlanner()): SorobanBatchPlannerStatus {
  const items = planner.snapshot();
  const byState: Record<string, number> = {};

  for (const item of items) {
    byState[item.state] = (byState[item.state] ?? 0) + 1;
  }

  return { totalItems: items.length, byState, items };
}
