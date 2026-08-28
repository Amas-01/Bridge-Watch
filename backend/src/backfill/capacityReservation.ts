import type { CapacityBudget } from "./types.js";

/**
 * Token bucket rate limiter that reserves capacity for live traffic.
 * Backfill operations can only consume tokens not reserved for live use.
 */
export class CapacityReservation {
  private budget: CapacityBudget;
  private backfillTokens: number;
  private lastRefill: number;

  constructor(
    totalRatePerSecond: number,
    reservedForLive: number
  ) {
    if (reservedForLive > totalRatePerSecond) {
      throw new Error(
        `Reserved live capacity (${reservedForLive}) exceeds total (${totalRatePerSecond})`
      );
    }

    this.budget = {
      totalRatePerSecond,
      reservedForLive,
      availableForBackfill: totalRatePerSecond - reservedForLive,
      currentBackfillUsage: 0,
    };

    this.backfillTokens = this.budget.availableForBackfill;
    this.lastRefill = Date.now();
  }

  /**
   * Try to consume tokens for a backfill operation.
   * Returns true if tokens were available and consumed.
   */
  tryAcquire(tokens: number): boolean {
    this.refill();

    if (tokens <= this.backfillTokens) {
      this.backfillTokens -= tokens;
      this.budget.currentBackfillUsage += tokens;
      return true;
    }

    return false;
  }

  /**
   * Release tokens back to the bucket (e.g. on chunk completion).
   */
  release(tokens: number): void {
    this.backfillTokens = Math.min(
      this.backfillTokens + tokens,
      this.budget.availableForBackfill
    );
    this.budget.currentBackfillUsage = Math.max(
      0,
      this.budget.currentBackfillUsage - tokens
    );
  }

  /**
   * Returns the current capacity budget snapshot.
   */
  getBudget(): CapacityBudget {
    this.refill();
    return { ...this.budget };
  }

  /**
   * Returns the number of tokens available right now for backfill.
   */
  availableTokens(): number {
    this.refill();
    return Math.floor(this.backfillTokens);
  }

  /**
   * Calculates the delay needed before `tokens` can be acquired.
   * Returns 0 if tokens are available now.
   */
  waitTimeMs(tokens: number): number {
    this.refill();

    if (tokens <= this.backfillTokens) return 0;

    const deficit = tokens - this.backfillTokens;
    const refillRate = this.budget.availableForBackfill;
    return Math.ceil((deficit / refillRate) * 1000);
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const refillAmount = elapsed * this.budget.availableForBackfill;

    this.backfillTokens = Math.min(
      this.backfillTokens + refillAmount,
      this.budget.availableForBackfill
    );
    this.lastRefill = now;
  }
}
