/**
 * Volume Anomaly Review Queue Service
 * Issue #1136
 *
 * Receives volume anomalies from the detector and holds them in a triage queue
 * where an operator assigns, annotates and resolves each one with a disposition.
 * Every item carries a severity-derived priority and SLA due time, and every
 * state change is appended to an immutable history trail for audit.
 *
 * Ingestion is idempotent on the detector's anomalyId. Storage is in-memory;
 * callers own persistence.
 */

export type AnomalySeverity = "low" | "medium" | "high" | "critical";
export type ReviewStatus = "pending" | "in_review" | "resolved";
export type ReviewDisposition =
  | "confirmed_incident"
  | "benign_spike"
  | "false_positive"
  | "needs_more_data";

const SEVERITIES: readonly AnomalySeverity[] = ["low", "medium", "high", "critical"];
const DISPOSITIONS: readonly ReviewDisposition[] = [
  "confirmed_incident",
  "benign_spike",
  "false_positive",
  "needs_more_data",
];

/** SLA to first resolution, in milliseconds, keyed by severity. */
const SLA_MS: Record<AnomalySeverity, number> = {
  critical: 60 * 60 * 1000,
  high: 4 * 60 * 60 * 1000,
  medium: 24 * 60 * 60 * 1000,
  low: 72 * 60 * 60 * 1000,
};

const BASE_PRIORITY: Record<AnomalySeverity, number> = {
  critical: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export interface VolumeAnomalyInput {
  /** Stable id from the detector; used as the idempotency key. */
  anomalyId: string;
  assetCode: string;
  bridgeId?: string;
  chain: string;
  severity: AnomalySeverity;
  observedVolumeUsd: number;
  baselineVolumeUsd: number;
  detectedAt?: number;
}

export interface ReviewNote {
  author: string;
  note: string;
  at: string;
}

export interface HistoryEntry {
  at: string;
  actor: string;
  action: string;
  detail?: string;
}

export interface QueueItem {
  id: string;
  anomalyId: string;
  assetCode: string;
  bridgeId: string | null;
  chain: string;
  severity: AnomalySeverity;
  observedVolumeUsd: number;
  baselineVolumeUsd: number;
  /** (observed - baseline) / baseline * 100; positive is a spike. */
  deviationPct: number;
  /** 1 (highest) .. 4 (lowest). */
  priority: number;
  status: ReviewStatus;
  assignee: string | null;
  disposition: ReviewDisposition | null;
  resolutionNote: string | null;
  notes: ReviewNote[];
  history: HistoryEntry[];
  detectedAt: string;
  slaDueAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface QueueFilter {
  status?: ReviewStatus;
  severity?: AnomalySeverity;
  assignee?: string;
  overdueOnly?: boolean;
}

export interface QueueStats {
  total: number;
  byStatus: Record<ReviewStatus, number>;
  bySeverity: Record<AnomalySeverity, number>;
  overdue: number;
  avgResolutionMs: number | null;
}

const round2 = (n: number): number => Number(n.toFixed(2));

export class VolumeAnomalyReviewQueueService {
  private items: Map<string, QueueItem> = new Map();
  private byAnomalyId: Map<string, string> = new Map();

  public enqueue(input: VolumeAnomalyInput, now: number = Date.now()): QueueItem {
    if (!input.anomalyId || !input.assetCode || !input.chain) {
      throw new Error("anomalyId, assetCode and chain are required");
    }
    if (!SEVERITIES.includes(input.severity)) {
      throw new Error(`Unknown severity: ${input.severity}`);
    }
    if (!Number.isFinite(input.observedVolumeUsd) || input.observedVolumeUsd < 0) {
      throw new Error("observedVolumeUsd must be zero or a positive number");
    }
    if (!Number.isFinite(input.baselineVolumeUsd) || input.baselineVolumeUsd < 0) {
      throw new Error("baselineVolumeUsd must be zero or a positive number");
    }

    const existingId = this.byAnomalyId.get(input.anomalyId);
    if (existingId) {
      return this.items.get(existingId)!;
    }

    const detectedAt = input.detectedAt ?? now;
    const deviationPct =
      input.baselineVolumeUsd > 0
        ? round2(
            ((input.observedVolumeUsd - input.baselineVolumeUsd) / input.baselineVolumeUsd) * 100,
          )
        : 0;

    // A large deviation lifts priority one notch above the severity baseline.
    let priority = BASE_PRIORITY[input.severity];
    if (Math.abs(deviationPct) >= 300 && priority > 1) {
      priority -= 1;
    }

    const nowIso = new Date(now).toISOString();
    const item: QueueItem = {
      id: `vaq_${now}_${Math.random().toString(36).slice(2, 9)}`,
      anomalyId: input.anomalyId,
      assetCode: input.assetCode,
      bridgeId: input.bridgeId ?? null,
      chain: input.chain,
      severity: input.severity,
      observedVolumeUsd: round2(input.observedVolumeUsd),
      baselineVolumeUsd: round2(input.baselineVolumeUsd),
      deviationPct,
      priority,
      status: "pending",
      assignee: null,
      disposition: null,
      resolutionNote: null,
      notes: [],
      history: [{ at: nowIso, actor: "system", action: "enqueued", detail: input.severity }],
      detectedAt: new Date(detectedAt).toISOString(),
      slaDueAt: new Date(detectedAt + SLA_MS[input.severity]).toISOString(),
      updatedAt: nowIso,
      resolvedAt: null,
    };

    this.items.set(item.id, item);
    this.byAnomalyId.set(item.anomalyId, item.id);
    return item;
  }

  public assign(itemId: string, assignee: string, actor: string, now: number = Date.now()): QueueItem {
    const item = this.require(itemId);
    if (item.status === "resolved") {
      throw new Error("Cannot assign a resolved item; reopen it first");
    }
    if (!assignee) {
      throw new Error("assignee is required");
    }
    item.assignee = assignee;
    item.status = "in_review";
    this.touch(item, actor, "assigned", assignee, now);
    return item;
  }

  public addNote(itemId: string, author: string, note: string, now: number = Date.now()): QueueItem {
    const item = this.require(itemId);
    if (!author || !note?.trim()) {
      throw new Error("author and note are required");
    }
    const at = new Date(now).toISOString();
    item.notes.push({ author, note: note.trim(), at });
    this.touch(item, author, "note_added", undefined, now);
    return item;
  }

  public resolve(
    itemId: string,
    actor: string,
    disposition: ReviewDisposition,
    resolutionNote: string,
    now: number = Date.now(),
  ): QueueItem {
    const item = this.require(itemId);
    if (item.status === "resolved") {
      throw new Error("Item is already resolved");
    }
    if (!DISPOSITIONS.includes(disposition)) {
      throw new Error(`Unknown disposition: ${disposition}`);
    }
    if (!resolutionNote?.trim()) {
      throw new Error("resolutionNote is required");
    }
    item.status = "resolved";
    item.disposition = disposition;
    item.resolutionNote = resolutionNote.trim();
    item.resolvedAt = new Date(now).toISOString();
    this.touch(item, actor, "resolved", disposition, now);
    return item;
  }

  public reopen(itemId: string, actor: string, reason: string, now: number = Date.now()): QueueItem {
    const item = this.require(itemId);
    if (item.status !== "resolved") {
      throw new Error("Only resolved items can be reopened");
    }
    if (!reason?.trim()) {
      throw new Error("reason is required");
    }
    item.status = item.assignee ? "in_review" : "pending";
    item.disposition = null;
    item.resolutionNote = null;
    item.resolvedAt = null;
    this.touch(item, actor, "reopened", reason.trim(), now);
    return item;
  }

  public getItem(itemId: string): QueueItem | null {
    return this.items.get(itemId) ?? null;
  }

  public list(filter: QueueFilter = {}, now: number = Date.now()): QueueItem[] {
    return [...this.items.values()]
      .filter((item) => {
        if (filter.status && item.status !== filter.status) return false;
        if (filter.severity && item.severity !== filter.severity) return false;
        if (filter.assignee && item.assignee !== filter.assignee) return false;
        if (filter.overdueOnly && !this.isOverdue(item, now)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.status === "resolved" && b.status !== "resolved") return 1;
        if (b.status === "resolved" && a.status !== "resolved") return -1;
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.detectedAt.localeCompare(b.detectedAt);
      });
  }

  public stats(now: number = Date.now()): QueueStats {
    const all = [...this.items.values()];
    const byStatus: Record<ReviewStatus, number> = { pending: 0, in_review: 0, resolved: 0 };
    const bySeverity: Record<AnomalySeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    let overdue = 0;
    const resolutionDurations: number[] = [];

    for (const item of all) {
      byStatus[item.status] += 1;
      bySeverity[item.severity] += 1;
      if (this.isOverdue(item, now)) overdue += 1;
      if (item.resolvedAt) {
        resolutionDurations.push(
          new Date(item.resolvedAt).getTime() - new Date(item.detectedAt).getTime(),
        );
      }
    }

    return {
      total: all.length,
      byStatus,
      bySeverity,
      overdue,
      avgResolutionMs:
        resolutionDurations.length === 0
          ? null
          : Math.round(
              resolutionDurations.reduce((a, b) => a + b, 0) / resolutionDurations.length,
            ),
    };
  }

  public isOverdue(item: QueueItem, now: number = Date.now()): boolean {
    return item.status !== "resolved" && now > new Date(item.slaDueAt).getTime();
  }

  private require(itemId: string): QueueItem {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Queue item not found: ${itemId}`);
    }
    return item;
  }

  private touch(item: QueueItem, actor: string, action: string, detail: string | undefined, now: number): void {
    const at = new Date(now).toISOString();
    item.history.push({ at, actor: actor || "unknown", action, detail });
    item.updatedAt = at;
  }
}

export const volumeAnomalyReviewQueueService = new VolumeAnomalyReviewQueueService();
