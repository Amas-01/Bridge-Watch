import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";

/**
 * Queue starvation detection.
 *
 * "Starvation" here means work is enqueued but not being drained — distinct
 * from a *backlog*, where consumers are working flat out and simply cannot keep
 * up. The two look identical on a depth graph and need opposite responses:
 * a backlog wants more consumers, starvation wants someone to find out why the
 * existing consumers stopped.
 *
 * Depth alone cannot tell them apart, so detection needs three signals
 * together:
 *
 *   - **depth** — is there work waiting at all?
 *   - **oldestAgeMs** — how long has the head of the queue been waiting?
 *   - **processedInWindow** — did anything actually drain?
 *
 * The interesting case is depth > 0, oldest item aging past the threshold, and
 * processed == 0. That is starvation: work is present, nothing is moving. If
 * `processedInWindow` is healthy the queue is merely busy, however deep it is.
 */

export type StarvationSeverity = "healthy" | "degraded" | "starved";

export interface QueueSample {
  queueName: string;
  /** Items waiting to be processed. */
  depth: number;
  /** Age of the oldest waiting item, in ms. */
  oldestAgeMs: number;
  /** Items completed during the sampling window. */
  processedInWindow: number;
  /** Consumers currently registered against the queue. */
  activeConsumers: number;
  sampledAt: string;
}

export interface StarvationPolicy {
  queueName: string;
  /** Oldest-item age beyond which the queue is considered degraded. */
  degradedAfterMs: number;
  /** Oldest-item age beyond which it is starved, given nothing drained. */
  starvedAfterMs: number;
  /** Consecutive starved samples before a signal is raised. */
  consecutiveSamples: number;
  enabled: boolean;
}

export interface StarvationAssessment {
  queueName: string;
  severity: StarvationSeverity;
  reason: string;
  depth: number;
  oldestAgeMs: number;
  processedInWindow: number;
  activeConsumers: number;
}

export const DEFAULT_STARVATION_POLICY: Omit<StarvationPolicy, "queueName"> = {
  degradedAfterMs: 60_000,
  starvedAfterMs: 300_000,
  consecutiveSamples: 3,
  enabled: true,
};

// ── Pure detection ──────────────────────────────────────────────────────────

/**
 * Classify a single sample.
 *
 * Deliberately pure: this is the rule that decides whether someone gets paged,
 * so it is tested directly rather than through a database.
 */
export function assessSample(
  sample: QueueSample,
  policy: StarvationPolicy = { queueName: sample.queueName, ...DEFAULT_STARVATION_POLICY }
): StarvationAssessment {
  const base = {
    queueName: sample.queueName,
    depth: sample.depth,
    oldestAgeMs: sample.oldestAgeMs,
    processedInWindow: sample.processedInWindow,
    activeConsumers: sample.activeConsumers,
  };

  if (!policy.enabled) {
    return { ...base, severity: "healthy", reason: "detection disabled for this queue" };
  }

  // An empty queue cannot be starving, however few consumers are attached.
  if (sample.depth === 0) {
    return { ...base, severity: "healthy", reason: "queue is empty" };
  }

  // No consumers with work waiting is unambiguous — nothing can drain it, so
  // there is no need to wait for the age threshold.
  if (sample.activeConsumers === 0) {
    return { ...base, severity: "starved", reason: "work is queued but no consumers are attached" };
  }

  // Work is draining. Depth may be high, but that is a capacity question, not
  // starvation, and paging on it would train people to ignore the alert.
  if (sample.processedInWindow > 0) {
    return sample.oldestAgeMs >= policy.starvedAfterMs
      ? {
          ...base,
          severity: "degraded",
          reason: `queue is draining but the oldest item has waited ${sample.oldestAgeMs}ms`,
        }
      : { ...base, severity: "healthy", reason: "queue is draining" };
  }

  // Nothing drained in the window.
  if (sample.oldestAgeMs >= policy.starvedAfterMs) {
    return {
      ...base,
      severity: "starved",
      reason: `nothing processed while the oldest item waited ${sample.oldestAgeMs}ms`,
    };
  }

  if (sample.oldestAgeMs >= policy.degradedAfterMs) {
    return {
      ...base,
      severity: "degraded",
      reason: `nothing processed in the window; oldest item waiting ${sample.oldestAgeMs}ms`,
    };
  }

  return { ...base, severity: "healthy", reason: "within thresholds" };
}

/**
 * Whether a run of samples warrants raising a signal.
 *
 * Requiring consecutive starved samples is what keeps a single slow window —
 * a deploy, a GC pause, a brief lock — from paging anyone. The run must be
 * unbroken: one healthy sample means the queue moved, and the clock restarts.
 */
export function shouldRaiseSignal(
  assessments: StarvationAssessment[],
  policy: Pick<StarvationPolicy, "consecutiveSamples">
): boolean {
  if (assessments.length < policy.consecutiveSamples) return false;
  return assessments
    .slice(-policy.consecutiveSamples)
    .every((assessment) => assessment.severity === "starved");
}

/** Highest severity across a set of queues, for a single rolled-up status. */
export function worstSeverity(assessments: StarvationAssessment[]): StarvationSeverity {
  if (assessments.some((a) => a.severity === "starved")) return "starved";
  if (assessments.some((a) => a.severity === "degraded")) return "degraded";
  return "healthy";
}

const mapPolicy = (r: any): StarvationPolicy => ({
  queueName: r.queue_name,
  degradedAfterMs: Number(r.degraded_after_ms),
  starvedAfterMs: Number(r.starved_after_ms),
  consecutiveSamples: Number(r.consecutive_samples),
  enabled: Boolean(r.enabled),
});

export class QueueStarvationService {
  constructor(private readonly db: Knex = getDatabase()) {}

  async getPolicy(queueName: string): Promise<StarvationPolicy> {
    const row = await this.db("queue_starvation_policies").where({ queue_name: queueName }).first();
    return row ? mapPolicy(row) : { queueName, ...DEFAULT_STARVATION_POLICY };
  }

  async upsertPolicy(policy: StarvationPolicy): Promise<StarvationPolicy> {
    const values = {
      queue_name: policy.queueName,
      degraded_after_ms: policy.degradedAfterMs,
      starved_after_ms: policy.starvedAfterMs,
      consecutive_samples: policy.consecutiveSamples,
      enabled: policy.enabled,
      updated_at: new Date(),
    };
    const [row] = await this.db("queue_starvation_policies")
      .insert(values)
      .onConflict("queue_name")
      .merge()
      .returning("*");
    return mapPolicy(row);
  }

  /** Persist a sample and its assessment; returns the assessment. */
  async recordSample(sample: QueueSample): Promise<StarvationAssessment> {
    const policy = await this.getPolicy(sample.queueName);
    const assessment = assessSample(sample, policy);

    await this.db("queue_starvation_samples").insert({
      queue_name: sample.queueName,
      depth: sample.depth,
      oldest_age_ms: sample.oldestAgeMs,
      processed_in_window: sample.processedInWindow,
      active_consumers: sample.activeConsumers,
      severity: assessment.severity,
      reason: assessment.reason,
      sampled_at: sample.sampledAt,
    });

    return assessment;
  }

  /** Most recent assessments for a queue, oldest first. */
  async recentAssessments(queueName: string, limit = 10): Promise<StarvationAssessment[]> {
    const rows = await this.db("queue_starvation_samples")
      .where({ queue_name: queueName })
      .orderBy("sampled_at", "desc")
      .limit(limit);

    return rows
      .map((r: any) => ({
        queueName: r.queue_name,
        severity: r.severity as StarvationSeverity,
        reason: r.reason,
        depth: Number(r.depth),
        oldestAgeMs: Number(r.oldest_age_ms),
        processedInWindow: Number(r.processed_in_window),
        activeConsumers: Number(r.active_consumers),
      }))
      .reverse();
  }
}

export const queueStarvationService = new QueueStarvationService();
