/**
 * Bridge TVL Change Notifications Service
 * Issue #1133
 *
 * Watches per-bridge Total Value Locked (TVL) samples and raises a notification
 * whenever the move between the previous and latest sample crosses a
 * subscription's percentage or absolute-USD threshold. Sharp drops are treated
 * as more severe than equivalent rises because they can signal an exploit or a
 * liquidity flight. Per-subscription cooldown suppresses repeat noise.
 *
 * Storage is in-memory; callers own persistence and channel delivery.
 */

export type TvlChangeDirection = "increase" | "decrease";
export type TvlAlertSeverity = "info" | "warning" | "critical";

export interface TvlSubscriptionInput {
  bridgeId: string;
  /** Trigger when |percent change| >= this value (e.g. 10 = 10%). */
  pctThreshold: number;
  /** Optional: also trigger when |USD change| >= this value. */
  absThresholdUsd?: number;
  /** Which directions to notify on; defaults to both. */
  directions?: TvlChangeDirection[];
  /** Minimum gap between notifications for this subscription, ms. Default 5 min. */
  cooldownMs?: number;
  /** Opaque channel ids the caller resolves for delivery. */
  channels: string[];
}

export interface TvlSubscription {
  id: string;
  bridgeId: string;
  pctThreshold: number;
  absThresholdUsd: number | null;
  directions: TvlChangeDirection[];
  cooldownMs: number;
  channels: string[];
  createdAt: string;
}

export interface TvlNotification {
  id: string;
  subscriptionId: string;
  bridgeId: string;
  direction: TvlChangeDirection;
  severity: TvlAlertSeverity;
  previousTvlUsd: number;
  currentTvlUsd: number;
  changeUsd: number;
  changePct: number;
  windowMs: number;
  channels: string[];
  message: string;
  triggeredAt: string;
}

interface TvlSample {
  tvlUsd: number;
  at: number;
}

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const round2 = (n: number): number => Number(n.toFixed(2));

export class BridgeTvlChangeNotificationService {
  private subscriptions: Map<string, TvlSubscription> = new Map();
  private lastSample: Map<string, TvlSample> = new Map();
  private lastNotifiedAt: Map<string, number> = new Map();
  private notifications: TvlNotification[] = [];

  public subscribe(input: TvlSubscriptionInput): TvlSubscription {
    if (!input.bridgeId) {
      throw new Error("bridgeId is required");
    }
    if (!Number.isFinite(input.pctThreshold) || input.pctThreshold <= 0) {
      throw new Error("pctThreshold must be a positive number");
    }
    if (
      input.absThresholdUsd !== undefined &&
      (!Number.isFinite(input.absThresholdUsd) || input.absThresholdUsd <= 0)
    ) {
      throw new Error("absThresholdUsd must be a positive number when provided");
    }
    if (!Array.isArray(input.channels) || input.channels.length === 0) {
      throw new Error("At least one channel is required");
    }
    const directions = input.directions ?? ["increase", "decrease"];
    if (directions.length === 0 || directions.some((d) => d !== "increase" && d !== "decrease")) {
      throw new Error("directions must be a non-empty subset of increase/decrease");
    }
    const cooldownMs = input.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    if (!Number.isFinite(cooldownMs) || cooldownMs < 0) {
      throw new Error("cooldownMs must be zero or a positive number");
    }

    const sub: TvlSubscription = {
      id: `tvlsub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      bridgeId: input.bridgeId,
      pctThreshold: input.pctThreshold,
      absThresholdUsd: input.absThresholdUsd ?? null,
      directions: [...new Set(directions)],
      cooldownMs,
      channels: [...input.channels],
      createdAt: new Date().toISOString(),
    };
    this.subscriptions.set(sub.id, sub);
    return sub;
  }

  public unsubscribe(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  public listSubscriptions(bridgeId?: string): TvlSubscription[] {
    const all = [...this.subscriptions.values()];
    return bridgeId ? all.filter((s) => s.bridgeId === bridgeId) : all;
  }

  /**
   * Ingest a TVL sample for a bridge. Returns every notification triggered by
   * the move from the previous sample to this one.
   */
  public recordTvlSample(
    bridgeId: string,
    tvlUsd: number,
    timestamp: number = Date.now(),
  ): TvlNotification[] {
    if (!bridgeId) {
      throw new Error("bridgeId is required");
    }
    if (!Number.isFinite(tvlUsd) || tvlUsd < 0) {
      throw new Error("tvlUsd must be zero or a positive number");
    }

    const previous = this.lastSample.get(bridgeId);
    this.lastSample.set(bridgeId, { tvlUsd, at: timestamp });
    if (!previous || previous.tvlUsd === 0) {
      return [];
    }

    const changeUsd = tvlUsd - previous.tvlUsd;
    if (changeUsd === 0) {
      return [];
    }
    const changePct = (changeUsd / previous.tvlUsd) * 100;
    const direction: TvlChangeDirection = changeUsd > 0 ? "increase" : "decrease";
    const absPct = Math.abs(changePct);
    const absUsd = Math.abs(changeUsd);
    const windowMs = Math.max(0, timestamp - previous.at);

    const fired: TvlNotification[] = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.bridgeId !== bridgeId) continue;
      if (!sub.directions.includes(direction)) continue;

      const pctHit = absPct >= sub.pctThreshold;
      const absHit = sub.absThresholdUsd !== null && absUsd >= sub.absThresholdUsd;
      if (!pctHit && !absHit) continue;

      const lastAt = this.lastNotifiedAt.get(sub.id);
      if (lastAt !== undefined && timestamp - lastAt < sub.cooldownMs) continue;
      this.lastNotifiedAt.set(sub.id, timestamp);

      const severity = this.classifySeverity(absPct, direction);
      const notification: TvlNotification = {
        id: `tvlntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        subscriptionId: sub.id,
        bridgeId,
        direction,
        severity,
        previousTvlUsd: round2(previous.tvlUsd),
        currentTvlUsd: round2(tvlUsd),
        changeUsd: round2(changeUsd),
        changePct: round2(changePct),
        windowMs,
        channels: [...sub.channels],
        message:
          `Bridge ${bridgeId} TVL ${direction === "increase" ? "rose" : "fell"} ` +
          `${round2(absPct)}% (${changeUsd > 0 ? "+" : "-"}$${round2(absUsd)}) ` +
          `from $${round2(previous.tvlUsd)} to $${round2(tvlUsd)}`,
        triggeredAt: new Date(timestamp).toISOString(),
      };
      this.notifications.push(notification);
      fired.push(notification);
    }
    return fired;
  }

  public getNotifications(bridgeId?: string): TvlNotification[] {
    return bridgeId
      ? this.notifications.filter((n) => n.bridgeId === bridgeId)
      : [...this.notifications];
  }

  private classifySeverity(absPct: number, direction: TvlChangeDirection): TvlAlertSeverity {
    let base: TvlAlertSeverity = absPct >= 25 ? "critical" : absPct >= 10 ? "warning" : "info";
    // A drop is one tier more serious than the same-sized rise.
    if (direction === "decrease") {
      base = base === "info" ? "warning" : "critical";
    }
    return base;
  }
}

export const bridgeTvlChangeNotificationService = new BridgeTvlChangeNotificationService();
