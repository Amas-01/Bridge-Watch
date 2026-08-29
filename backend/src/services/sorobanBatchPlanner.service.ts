import { logger } from "../utils/logger.js";
import type { SorobanRpcClient, SorobanInvocationRequest } from "./stellar/soroban.client.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Ceilings a packed batch may never exceed. All units are Soroban-native. */
export interface ResourceBudget {
  maxCpuInstructions: number;
  maxMemoryBytes: number;
  maxFootprintEntries: number;
  maxFeeStroops: number;
  maxBatchSize?: number;
}

export interface ResourceEstimate {
  cpuInstructions: number;
  memoryBytes: number;
  footprintEntries: number;
  feeStroops: number;
}

export interface BatchItemInput {
  id: string;
  /** Stable key for durable idempotency; duplicate submissions are deduplicated by this key. */
  idempotencyKey: string;
  contractId: string;
  functionName: string;
  args?: unknown[];
  priority?: number;
}

export type ItemLifecycleState =
  | "pending"
  | "estimating"
  | "planned"
  | "submitted"
  | "confirmed"
  | "retry_scheduled"
  | "rejected"
  | "dead_letter";

export interface PlannerItem extends BatchItemInput {
  state: ItemLifecycleState;
  estimate?: ResourceEstimate;
  actualUsage?: ResourceEstimate;
  attempts: number;
  nonce?: number;
  batchId?: string;
  rejectionReason?: string;
  lastError?: string;
}

export interface BatchPlan {
  batchId: string;
  items: PlannerItem[];
  totalEstimate: ResourceEstimate;
  nonceRange: { start: number; end: number };
}

export interface PlanResult {
  batches: BatchPlan[];
  /** Items that could not be planned into any batch, with a human-readable reason. */
  rejected: Array<{ item: PlannerItem; reason: string }>;
}

export interface SubmissionOutcome {
  id: string;
  success: boolean;
  error?: string;
  actualUsage?: ResourceEstimate;
}

export interface ReconcileResult {
  confirmed: PlannerItem[];
  rescheduled: PlannerItem[];
  deadLettered: PlannerItem[];
  /** id -> explanation, covering every non-confirmed item touched by this reconcile call. */
  explanations: Map<string, string>;
}

export type EstimateFn = (item: BatchItemInput) => Promise<ResourceEstimate>;

export interface SorobanBatchPlannerOptions {
  estimate: EstimateFn;
  maxRetries?: number;
  /** Multiplier applied to a resource dimension after a mismatch/failure attributed to it. */
  adaptationStep?: number;
  /** Hard ceiling on the adaptation multiplier so retries cannot spiral. */
  maxAdaptationFactor?: number;
  nonceStart?: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_ADAPTATION_STEP = 1.25;
const DEFAULT_MAX_ADAPTATION_FACTOR = 3;

function zeroEstimate(): ResourceEstimate {
  return { cpuInstructions: 0, memoryBytes: 0, footprintEntries: 0, feeStroops: 0 };
}

function addEstimate(a: ResourceEstimate, b: ResourceEstimate): ResourceEstimate {
  return {
    cpuInstructions: a.cpuInstructions + b.cpuInstructions,
    memoryBytes: a.memoryBytes + b.memoryBytes,
    footprintEntries: a.footprintEntries + b.footprintEntries,
    feeStroops: a.feeStroops + b.feeStroops,
  };
}

function fitsWithin(total: ResourceEstimate, item: ResourceEstimate, budget: ResourceBudget): boolean {
  return (
    total.cpuInstructions + item.cpuInstructions <= budget.maxCpuInstructions &&
    total.memoryBytes + item.memoryBytes <= budget.maxMemoryBytes &&
    total.footprintEntries + item.footprintEntries <= budget.maxFootprintEntries &&
    total.feeStroops + item.feeStroops <= budget.maxFeeStroops
  );
}

function exceedsBudgetAlone(item: ResourceEstimate, budget: ResourceBudget): boolean {
  return (
    item.cpuInstructions > budget.maxCpuInstructions ||
    item.memoryBytes > budget.maxMemoryBytes ||
    item.footprintEntries > budget.maxFootprintEntries ||
    item.feeStroops > budget.maxFeeStroops
  );
}

/** Normalized weight (0..1+) used to sort items largest-first before bin-packing. */
function normalizedWeight(item: ResourceEstimate, budget: ResourceBudget): number {
  return Math.max(
    item.cpuInstructions / budget.maxCpuInstructions,
    item.memoryBytes / budget.maxMemoryBytes,
    item.footprintEntries / budget.maxFootprintEntries,
    item.feeStroops / budget.maxFeeStroops
  );
}

/**
 * Resource-budget-aware planner for batching Soroban submissions.
 *
 * Estimates simulation cost per item, packs compatible items into batches that
 * respect configured CPU / memory / footprint / fee ceilings, reserves ordered
 * nonce slots per planned item, and reconciles partial batch acceptance with
 * bounded, per-(contract, function) adaptation so repeated mismatches widen
 * the safety margin instead of retrying blindly forever.
 */
export class SorobanBatchPlanner {
  private readonly budget: ResourceBudget;
  private readonly estimateFn: EstimateFn;
  private readonly maxRetries: number;
  private readonly adaptationStep: number;
  private readonly maxAdaptationFactor: number;
  private nextNonce: number;

  /** Durable ledger of every item ever accepted, keyed by idempotency key. */
  private readonly ledger = new Map<string, PlannerItem>();
  /** Per (contractId:functionName) safety-margin multiplier, bounded by maxAdaptationFactor. */
  private readonly adaptationFactors = new Map<string, number>();

  constructor(budget: ResourceBudget, options: SorobanBatchPlannerOptions) {
    this.budget = budget;
    this.estimateFn = options.estimate;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.adaptationStep = options.adaptationStep ?? DEFAULT_ADAPTATION_STEP;
    this.maxAdaptationFactor = options.maxAdaptationFactor ?? DEFAULT_MAX_ADAPTATION_FACTOR;
    this.nextNonce = options.nonceStart ?? 0;
  }

  getItem(idempotencyKey: string): PlannerItem | undefined {
    return this.ledger.get(idempotencyKey);
  }

  /** Full lifecycle ledger snapshot, e.g. for a status/inspection endpoint. */
  snapshot(): PlannerItem[] {
    return [...this.ledger.values()];
  }

  private adaptationKey(item: BatchItemInput): string {
    return `${item.contractId}:${item.functionName}`;
  }

  private applyAdaptation(item: BatchItemInput, raw: ResourceEstimate): ResourceEstimate {
    const factor = this.adaptationFactors.get(this.adaptationKey(item)) ?? 1;
    if (factor === 1) return raw;

    return {
      cpuInstructions: Math.ceil(raw.cpuInstructions * factor),
      memoryBytes: Math.ceil(raw.memoryBytes * factor),
      footprintEntries: raw.footprintEntries,
      feeStroops: Math.ceil(raw.feeStroops * factor),
    };
  }

  private bumpAdaptation(item: BatchItemInput): void {
    const key = this.adaptationKey(item);
    const current = this.adaptationFactors.get(key) ?? 1;
    const next = Math.min(current * this.adaptationStep, this.maxAdaptationFactor);
    this.adaptationFactors.set(key, next);
  }

  /**
   * Registers items (deduplicating by idempotency key against durable state),
   * estimates simulation cost for each, and packs the accepted set into
   * budget-respecting batches with reserved nonce slots.
   */
  async plan(inputs: BatchItemInput[]): Promise<PlanResult> {
    const candidates: PlannerItem[] = [];
    const rejected: PlanResult["rejected"] = [];

    for (const input of inputs) {
      const existing = this.ledger.get(input.idempotencyKey);
      if (existing && (existing.state === "confirmed" || existing.state === "submitted" || existing.state === "planned")) {
        logger.debug({ idempotencyKey: input.idempotencyKey, state: existing.state }, "Skipping duplicate Soroban batch submission");
        continue;
      }

      const item: PlannerItem = existing ?? {
        ...input,
        state: "pending",
        attempts: 0,
      };
      item.state = "estimating";

      let rawEstimate: ResourceEstimate;
      try {
        rawEstimate = await this.estimateFn(input);
      } catch (error) {
        item.state = "rejected";
        item.rejectionReason = `simulation failed: ${error instanceof Error ? error.message : String(error)}`;
        this.ledger.set(input.idempotencyKey, item);
        rejected.push({ item, reason: item.rejectionReason });
        continue;
      }

      const estimate = this.applyAdaptation(input, rawEstimate);
      item.estimate = estimate;

      if (exceedsBudgetAlone(estimate, this.budget)) {
        item.state = "rejected";
        item.rejectionReason = "estimated resource usage exceeds configured budget ceilings even alone";
        this.ledger.set(input.idempotencyKey, item);
        rejected.push({ item, reason: item.rejectionReason });
        continue;
      }

      this.ledger.set(input.idempotencyKey, item);
      candidates.push(item);
    }

    const batches = this.packBatches(candidates);
    return { batches, rejected };
  }

  /** First-fit-decreasing bin packing across all four resource dimensions plus batch size. */
  private packBatches(items: PlannerItem[]): BatchPlan[] {
    const sorted = [...items].sort((a, b) => {
      const weightDelta = normalizedWeight(b.estimate!, this.budget) - normalizedWeight(a.estimate!, this.budget);
      if (weightDelta !== 0) return weightDelta;
      return (b.priority ?? 0) - (a.priority ?? 0);
    });

    const maxBatchSize = this.budget.maxBatchSize ?? Infinity;
    const bins: Array<{ items: PlannerItem[]; total: ResourceEstimate }> = [];

    for (const item of sorted) {
      const estimate = item.estimate!;
      let placed = false;

      for (const bin of bins) {
        if (bin.items.length >= maxBatchSize) continue;
        if (!fitsWithin(bin.total, estimate, this.budget)) continue;

        bin.items.push(item);
        bin.total = addEstimate(bin.total, estimate);
        placed = true;
        break;
      }

      if (!placed) {
        bins.push({ items: [item], total: estimate });
      }
    }

    return bins.map((bin) => {
      const batchId = `batch-${this.nextNonce}-${Date.now().toString(36)}`;
      const start = this.nextNonce;

      for (const item of bin.items) {
        item.state = "planned";
        item.batchId = batchId;
        item.nonce = this.nextNonce;
        this.nextNonce += 1;
      }

      return {
        batchId,
        items: bin.items,
        totalEstimate: bin.total,
        nonceRange: { start, end: this.nextNonce - 1 },
      };
    });
  }

  /** Marks every item in a planned batch as submitted, immediately prior to on-chain send. */
  markSubmitted(batch: BatchPlan): void {
    for (const item of batch.items) {
      if (item.state !== "planned") continue;
      item.state = "submitted";
    }
  }

  /**
   * Reconciles the actual submission outcome per item. Successful items keep
   * their result and are marked confirmed; failed items are retried with a
   * bounded adaptation to their resource-estimate safety margin until
   * maxRetries is exhausted, at which point they are dead-lettered with an
   * explanation. Already-terminal items are left untouched so reconciling the
   * same batch twice never duplicates a state transition.
   */
  reconcile(batch: BatchPlan, outcomes: SubmissionOutcome[]): ReconcileResult {
    const outcomeById = new Map(outcomes.map((o) => [o.id, o]));
    const result: ReconcileResult = {
      confirmed: [],
      rescheduled: [],
      deadLettered: [],
      explanations: new Map(),
    };

    for (const item of batch.items) {
      // Only items still awaiting an outcome for *this* batch can transition;
      // this makes reconcile idempotent if the same batch is reconciled twice.
      if (item.state !== "submitted") {
        continue;
      }

      const outcome = outcomeById.get(item.id);
      if (!outcome) {
        continue;
      }

      if (outcome.success) {
        item.state = "confirmed";
        item.actualUsage = outcome.actualUsage;

        if (outcome.actualUsage && item.estimate && this.isMismatch(item.estimate, outcome.actualUsage)) {
          this.bumpAdaptation(item);
          logger.warn(
            { id: item.id, estimate: item.estimate, actual: outcome.actualUsage },
            "Soroban simulation/actual resource usage mismatch; widened adaptation margin"
          );
        }

        result.confirmed.push(item);
        continue;
      }

      item.attempts += 1;
      item.lastError = outcome.error;
      this.bumpAdaptation(item);

      if (item.attempts >= this.maxRetries) {
        item.state = "dead_letter";
        const reason = `exceeded ${this.maxRetries} retries; last error: ${outcome.error ?? "unknown"}`;
        item.rejectionReason = reason;
        result.deadLettered.push(item);
        result.explanations.set(item.id, reason);
      } else {
        item.state = "retry_scheduled";
        item.batchId = undefined;
        item.nonce = undefined;
        const reason = `attempt ${item.attempts}/${this.maxRetries} failed: ${outcome.error ?? "unknown"}; rescheduled`;
        result.rescheduled.push(item);
        result.explanations.set(item.id, reason);
      }
    }

    return result;
  }

  /** Items marked retry_scheduled by the last reconcile, ready to be re-planned. */
  itemsPendingRetry(): BatchItemInput[] {
    return [...this.ledger.values()]
      .filter((item) => item.state === "retry_scheduled")
      .map(({ id, idempotencyKey, contractId, functionName, args, priority }) => ({
        id,
        idempotencyKey,
        contractId,
        functionName,
        args,
        priority,
      }));
  }

  private isMismatch(estimate: ResourceEstimate, actual: ResourceEstimate): boolean {
    const dims: Array<keyof ResourceEstimate> = ["cpuInstructions", "memoryBytes", "footprintEntries", "feeStroops"];
    return dims.some((dim) => actual[dim] > estimate[dim] * 1.05);
  }
}

function countFootprintEntries(raw: unknown): number {
  const transactionData = (raw as { transactionData?: { _data?: { resources?: () => { footprint?: () => { readOnly?: () => unknown[]; readWrite?: () => unknown[] } } } } })
    ?.transactionData;
  const footprint = transactionData?._data?.resources?.()?.footprint?.();
  if (!footprint) return 1;

  const readOnly = footprint.readOnly?.()?.length ?? 0;
  const readWrite = footprint.readWrite?.()?.length ?? 0;
  return Math.max(readOnly + readWrite, 1);
}

/**
 * Adapts a live SorobanRpcClient into the planner's EstimateFn, translating a
 * dry-run simulation into the planner's normalized ResourceEstimate shape.
 */
export function createSorobanEstimateFn(
  client: SorobanRpcClient,
  buildInvocation: (item: BatchItemInput) => Omit<SorobanInvocationRequest, "signer">
): EstimateFn {
  return async (item) => {
    const gas = await client.estimateGas(buildInvocation(item));

    return {
      cpuInstructions: gas.cpuInstructions,
      memoryBytes: gas.memoryBytes,
      footprintEntries: countFootprintEntries(gas.raw),
      feeStroops: gas.minResourceFee,
    };
  };
}
