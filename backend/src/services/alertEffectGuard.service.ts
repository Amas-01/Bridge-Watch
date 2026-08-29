import { randomUUID } from "crypto";
import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EffectStatus =
  | "pending"
  | "delivered"
  | "ambiguous"
  | "duplicate_suppressed";

export type AlertDeliveryChannel =
  | "in_app"
  | "webhook"
  | "email"
  | "slack"
  | "websocket"
  | "telegram"
  | "discord";

export interface AlertEffectRecord {
  id: string;
  effectKey: string;
  outboxEventId: number;
  channel: AlertDeliveryChannel;
  status: EffectStatus;
  claimedBy: string | null;
  claimedAt: Date | null;
  leaseExpiresAt: Date | null;
  deliveredAt: Date | null;
  attemptCount: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimResult {
  /** True when this worker successfully claimed the effect. */
  claimed: boolean;
  /**
   * True when the effect_key already existed before this claim attempt,
   * meaning another worker already owns or completed this effect.
   */
  isDuplicate: boolean;
  /** The record as it exists after the operation. */
  record: AlertEffectRecord;
}

export interface EffectMetrics {
  pending: number;
  delivered: number;
  ambiguous: number;
  duplicateSuppressed: number;
  /** Total records across all statuses. */
  total: number;
  /** Per-channel breakdown. */
  byChannel: Record<string, { delivered: number; ambiguous: number; pending: number }>;
}

// ---------------------------------------------------------------------------
// Default lease duration
// ---------------------------------------------------------------------------

/** Workers must commit or mark ambiguous within this window or another worker reclaims. */
const DEFAULT_LEASE_MS = 30_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds the deterministic idempotency key for a (outbox event, channel) pair.
 * The key is stable across retries, process restarts, and multiple workers.
 */
export function buildEffectKey(
  outboxEventId: number | string,
  channel: AlertDeliveryChannel,
): string {
  return `${outboxEventId}:${channel}`;
}

function rowToRecord(row: Record<string, unknown>): AlertEffectRecord {
  return {
    id: row.id as string,
    effectKey: row.effect_key as string,
    outboxEventId: Number(row.outbox_event_id),
    channel: row.channel as AlertDeliveryChannel,
    status: row.status as EffectStatus,
    claimedBy: (row.claimed_by as string | null) ?? null,
    claimedAt: row.claimed_at ? new Date(row.claimed_at as string) : null,
    leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at as string) : null,
    deliveredAt: row.delivered_at ? new Date(row.delivered_at as string) : null,
    attemptCount: Number(row.attempt_count ?? 0),
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AlertEffectGuard {
  private readonly db: Knex;

  constructor(db?: Knex) {
    this.db = db ?? getDatabase();
  }

  // -------------------------------------------------------------------------
  // Public protocol
  // -------------------------------------------------------------------------

  /**
   * Atomically claims an effect slot for a (outbox event, channel) pair.
   *
   * Uses `INSERT ... ON CONFLICT (effect_key) DO NOTHING` to guarantee that
   * exactly one worker can claim any given effect_key, even under concurrent
   * retries across multiple processes.
   *
   * Returns:
   *   claimed=true    — this worker holds the lease and must deliver or mark ambiguous
   *   claimed=false   — another worker already owns or completed this effect
   *   isDuplicate     — the row pre-existed (always false when claimed=true)
   *
   * Crash recovery: if `leaseExpiresAt` passes before the worker calls
   * `commitEffect` or `markAmbiguous`, another worker may call
   * `reclaimExpiredLeases` to reset the slot to a fresh claimable state.
   */
  async claimEffect(
    outboxEventId: number,
    channel: AlertDeliveryChannel,
    workerId: string,
    leaseDurationMs: number = DEFAULT_LEASE_MS,
  ): Promise<ClaimResult> {
    const effectKey = buildEffectKey(outboxEventId, channel);
    const now = new Date();
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    try {
      await this.db("alert_effect_records").insert({
        effect_key: effectKey,
        outbox_event_id: outboxEventId,
        channel,
        status: "pending",
        claimed_by: workerId,
        claimed_at: now,
        lease_expires_at: leaseExpiresAt,
        attempt_count: 1,
        created_at: now,
        updated_at: now,
      }).onConflict("effect_key").ignore();
    } catch (err) {
      logger.warn({ err, effectKey, workerId }, "alertEffectGuard: insert failed");
      throw err;
    }

    // Read back the current record to determine whether we own it.
    const row = await this.db("alert_effect_records")
      .where({ effect_key: effectKey })
      .first() as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`alertEffectGuard: effect record missing after insert (key=${effectKey})`);
    }

    const record = rowToRecord(row);

    // We own the record only if our workerId matches the stored claimed_by
    // AND the status is still pending (not yet delivered by a previous attempt).
    const weOwnIt = record.claimedBy === workerId && record.status === "pending";
    const isDuplicate = !weOwnIt;

    if (isDuplicate) {
      logger.info(
        { effectKey, existingStatus: record.status, existingOwner: record.claimedBy },
        "alertEffectGuard: duplicate claim suppressed",
      );
    } else {
      logger.debug(
        { effectKey, workerId, leaseExpiresAt },
        "alertEffectGuard: effect claimed",
      );
    }

    return { claimed: weOwnIt, isDuplicate, record };
  }

  /**
   * Commits a successfully delivered effect.
   *
   * The update is guarded by `claimed_by = workerId` so a worker that had its
   * lease stolen by a crash-recovery sweep cannot accidentally commit over a
   * new owner's claim.
   */
  async commitEffect(
    outboxEventId: number,
    channel: AlertDeliveryChannel,
    workerId: string,
  ): Promise<boolean> {
    const effectKey = buildEffectKey(outboxEventId, channel);
    const now = new Date();

    const updated = await this.db("alert_effect_records")
      .where({ effect_key: effectKey, claimed_by: workerId })
      .whereIn("status", ["pending"])
      .update({
        status: "delivered",
        delivered_at: now,
        updated_at: now,
        error_message: null,
      });

    if (updated === 0) {
      logger.warn(
        { effectKey, workerId },
        "alertEffectGuard: commitEffect found no owned pending record — lease may have been stolen",
      );
      return false;
    }

    logger.debug({ effectKey, workerId }, "alertEffectGuard: effect committed");
    return true;
  }

  /**
   * Marks an effect as permanently ambiguous — the transport request was sent
   * but its outcome cannot be determined (e.g. webhook returned 5xx after
   * network timeout, so it may or may not have been received).
   *
   * Ambiguous records remain visible to operators for manual reconciliation.
   * They are never automatically retried.
   */
  async markAmbiguous(
    outboxEventId: number,
    channel: AlertDeliveryChannel,
    workerId: string,
    reason: string,
  ): Promise<boolean> {
    const effectKey = buildEffectKey(outboxEventId, channel);
    const now = new Date();

    const updated = await this.db("alert_effect_records")
      .where({ effect_key: effectKey, claimed_by: workerId })
      .whereIn("status", ["pending"])
      .update({
        status: "ambiguous",
        error_message: reason,
        updated_at: now,
      });

    if (updated === 0) {
      logger.warn({ effectKey, workerId }, "alertEffectGuard: markAmbiguous found no owned pending record");
      return false;
    }

    logger.info({ effectKey, workerId, reason }, "alertEffectGuard: effect marked ambiguous");
    return true;
  }

  /**
   * Finds all `pending` effect records whose lease has expired and resets them
   * so they can be re-claimed by a healthy worker.
   *
   * This is the crash-recovery mechanism: if a worker dies between claimEffect
   * and commitEffect, the slot does not remain stuck forever.
   *
   * Returns the number of records reclaimed.
   */
  async reclaimExpiredLeases(newWorkerId: string, leaseDurationMs = DEFAULT_LEASE_MS): Promise<number> {
    const now = new Date();
    const newLeaseExpiry = new Date(now.getTime() + leaseDurationMs);

    const updated = await this.db("alert_effect_records")
      .where("status", "pending")
      .where("lease_expires_at", "<", now)
      .update({
        claimed_by: newWorkerId,
        claimed_at: now,
        lease_expires_at: newLeaseExpiry,
        attempt_count: this.db.raw("attempt_count + 1"),
        updated_at: now,
      });

    if (updated > 0) {
      logger.info(
        { count: updated, newWorkerId },
        "alertEffectGuard: expired leases reclaimed",
      );
    }

    return updated;
  }

  /**
   * Records a duplicate-suppression event — written when a second worker
   * attempts to claim an already-delivered effect (e.g. manual retry).
   *
   * Does NOT overwrite the existing record; instead inserts a companion row
   * with status=duplicate_suppressed for audit visibility.
   */
  async recordDuplicateSuppression(
    outboxEventId: number,
    channel: AlertDeliveryChannel,
    attemptedBy: string,
    reason: string,
  ): Promise<void> {
    const baseKey = buildEffectKey(outboxEventId, channel);
    // Use a unique suffix so duplicate suppression rows don't collide with each other
    const suppressionKey = `${baseKey}:dup:${randomUUID()}`;
    const now = new Date();

    try {
      await this.db("alert_effect_records").insert({
        effect_key: suppressionKey,
        outbox_event_id: outboxEventId,
        channel,
        status: "duplicate_suppressed",
        claimed_by: attemptedBy,
        claimed_at: now,
        lease_expires_at: null,
        attempt_count: 0,
        error_message: reason,
        created_at: now,
        updated_at: now,
      });
    } catch (err) {
      // Non-fatal: audit log failure must not block the caller
      logger.warn({ err, suppressionKey }, "alertEffectGuard: failed to record duplicate suppression");
    }
  }

  // -------------------------------------------------------------------------
  // Metrics
  // -------------------------------------------------------------------------

  /**
   * Returns counts by status and channel — used by the operator dashboard and
   * Prometheus metrics scraper.
   */
  async getEffectMetrics(): Promise<EffectMetrics> {
    const rows = await this.db("alert_effect_records")
      .select("status", "channel")
      .count("* as count")
      .groupBy("status", "channel") as Array<{ status: string; channel: string; count: string | number }>;

    const metrics: EffectMetrics = {
      pending: 0,
      delivered: 0,
      ambiguous: 0,
      duplicateSuppressed: 0,
      total: 0,
      byChannel: {},
    };

    for (const row of rows) {
      const count = Number(row.count);
      metrics.total += count;

      switch (row.status as EffectStatus) {
        case "pending":
          metrics.pending += count;
          break;
        case "delivered":
          metrics.delivered += count;
          break;
        case "ambiguous":
          metrics.ambiguous += count;
          break;
        case "duplicate_suppressed":
          metrics.duplicateSuppressed += count;
          break;
      }

      const ch = row.channel;
      if (!metrics.byChannel[ch]) {
        metrics.byChannel[ch] = { delivered: 0, ambiguous: 0, pending: 0 };
      }
      const bucket = metrics.byChannel[ch]!;
      if (row.status === "delivered") bucket.delivered += count;
      else if (row.status === "ambiguous") bucket.ambiguous += count;
      else if (row.status === "pending") bucket.pending += count;
    }

    return metrics;
  }

  // -------------------------------------------------------------------------
  // Read helpers
  // -------------------------------------------------------------------------

  /** Returns all effect records for a given outbox event. */
  async getEffectsForEvent(outboxEventId: number): Promise<AlertEffectRecord[]> {
    const rows = await this.db("alert_effect_records")
      .where({ outbox_event_id: outboxEventId })
      .select("*") as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }

  /** Returns all ambiguous effect records for operator resolution. */
  async listAmbiguous(): Promise<AlertEffectRecord[]> {
    const rows = await this.db("alert_effect_records")
      .where({ status: "ambiguous" })
      .orderBy("created_at", "asc")
      .select("*") as Record<string, unknown>[];
    return rows.map(rowToRecord);
  }
}
