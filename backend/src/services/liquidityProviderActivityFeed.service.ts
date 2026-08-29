/**
 * Liquidity Provider Activity Feed Service
 * Issue #1134
 *
 * A newest-first, filterable feed of liquidity-provider actions (adds, removes,
 * fee claims, staking) across monitored pools. Ingestion is idempotent on the
 * transaction identity so replayed Horizon/RPC pages do not double-count.
 * `summary()` rolls the feed up into inflow/outflow/net-liquidity figures and a
 * top-provider leaderboard for a pool or the whole platform.
 *
 * Storage is in-memory; callers own persistence.
 */

export type LpAction = "add" | "remove" | "claim_fees" | "stake" | "unstake";

const LP_ACTIONS: readonly LpAction[] = ["add", "remove", "claim_fees", "stake", "unstake"];
const OUTFLOW_ACTIONS: readonly LpAction[] = ["remove", "unstake"];

export interface LpActivityInput {
  poolId: string;
  provider: string;
  action: LpAction;
  /** USD value of the position change; always non-negative. */
  amountUsd: number;
  txHash: string;
  chain: string;
  timestamp?: number;
}

export interface LpActivityEvent {
  id: string;
  poolId: string;
  provider: string;
  providerShort: string;
  action: LpAction;
  amountUsd: number;
  /** Negative for remove/unstake, zero for claim_fees, positive for add/stake. */
  signedAmountUsd: number;
  txHash: string;
  chain: string;
  timestamp: number;
  createdAt: string;
}

export interface LpFeedQuery {
  poolId?: string;
  provider?: string;
  action?: LpAction;
  chain?: string;
  since?: number;
  until?: number;
  /** Default 50, capped at 200. */
  limit?: number;
  /** Event id to page after; the feed is newest-first. */
  cursor?: string;
}

export interface LpFeedPage {
  events: LpActivityEvent[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface LpProviderRollup {
  provider: string;
  netUsd: number;
  events: number;
}

export interface LpActivitySummary {
  poolId: string | null;
  windowMs: number | null;
  eventCount: number;
  uniqueProviders: number;
  grossInflowUsd: number;
  grossOutflowUsd: number;
  netLiquidityUsd: number;
  feesClaimedUsd: number;
  topProviders: LpProviderRollup[];
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const round2 = (n: number): number => Number(n.toFixed(2));

const shortenAddress = (addr: string): string =>
  addr.length <= 12 ? addr : `${addr.slice(0, 6)}…${addr.slice(-4)}`;

export class LiquidityProviderActivityFeedService {
  /** Newest-first. */
  private events: LpActivityEvent[] = [];
  private byDedupeKey: Map<string, LpActivityEvent> = new Map();

  public record(input: LpActivityInput): LpActivityEvent {
    if (!input.poolId || !input.provider || !input.txHash || !input.chain) {
      throw new Error("poolId, provider, txHash and chain are required");
    }
    if (!LP_ACTIONS.includes(input.action)) {
      throw new Error(`Unknown LP action: ${input.action}`);
    }
    if (!Number.isFinite(input.amountUsd) || input.amountUsd < 0) {
      throw new Error("amountUsd must be zero or a positive number");
    }

    const timestamp = input.timestamp ?? Date.now();
    if (!Number.isFinite(timestamp)) {
      throw new Error("timestamp must be a number");
    }

    const dedupeKey = `${input.chain}:${input.txHash}:${input.poolId}:${input.provider}:${input.action}`;
    const existing = this.byDedupeKey.get(dedupeKey);
    if (existing) {
      return existing;
    }

    const sign = OUTFLOW_ACTIONS.includes(input.action)
      ? -1
      : input.action === "claim_fees"
        ? 0
        : 1;

    const event: LpActivityEvent = {
      id: `lp_${timestamp}_${Math.random().toString(36).slice(2, 9)}`,
      poolId: input.poolId,
      provider: input.provider,
      providerShort: shortenAddress(input.provider),
      action: input.action,
      amountUsd: round2(input.amountUsd),
      signedAmountUsd: round2(sign * input.amountUsd),
      txHash: input.txHash,
      chain: input.chain,
      timestamp,
      createdAt: new Date().toISOString(),
    };

    // Keep the array sorted newest-first even for out-of-order ingestion.
    const idx = this.events.findIndex((e) => e.timestamp <= timestamp);
    if (idx === -1) {
      this.events.push(event);
    } else {
      this.events.splice(idx, 0, event);
    }
    this.byDedupeKey.set(dedupeKey, event);
    return event;
  }

  public query(q: LpFeedQuery = {}): LpFeedPage {
    const limit = Math.min(Math.max(1, q.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    let rows = this.events.filter((e) => {
      if (q.poolId && e.poolId !== q.poolId) return false;
      if (q.provider && e.provider !== q.provider) return false;
      if (q.action && e.action !== q.action) return false;
      if (q.chain && e.chain !== q.chain) return false;
      if (q.since !== undefined && e.timestamp < q.since) return false;
      if (q.until !== undefined && e.timestamp > q.until) return false;
      return true;
    });

    if (q.cursor) {
      const cursorIdx = rows.findIndex((e) => e.id === q.cursor);
      rows = cursorIdx === -1 ? rows : rows.slice(cursorIdx + 1);
    }

    const page = rows.slice(0, limit);
    const hasMore = rows.length > limit;
    return {
      events: page,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      hasMore,
    };
  }

  public summary(opts: { poolId?: string; windowMs?: number; now?: number; topN?: number } = {}): LpActivitySummary {
    const now = opts.now ?? Date.now();
    const cutoff = opts.windowMs !== undefined ? now - opts.windowMs : null;
    const topN = opts.topN ?? 5;

    const rows = this.events.filter((e) => {
      if (opts.poolId && e.poolId !== opts.poolId) return false;
      if (cutoff !== null && e.timestamp < cutoff) return false;
      return true;
    });

    let grossInflowUsd = 0;
    let grossOutflowUsd = 0;
    let feesClaimedUsd = 0;
    const perProvider = new Map<string, LpProviderRollup>();

    for (const e of rows) {
      if (e.action === "claim_fees") {
        feesClaimedUsd += e.amountUsd;
      } else if (e.signedAmountUsd >= 0) {
        grossInflowUsd += e.amountUsd;
      } else {
        grossOutflowUsd += e.amountUsd;
      }
      const rollup = perProvider.get(e.provider) ?? { provider: e.provider, netUsd: 0, events: 0 };
      rollup.netUsd = round2(rollup.netUsd + e.signedAmountUsd);
      rollup.events += 1;
      perProvider.set(e.provider, rollup);
    }

    const topProviders = [...perProvider.values()]
      .sort((a, b) => Math.abs(b.netUsd) - Math.abs(a.netUsd))
      .slice(0, topN);

    return {
      poolId: opts.poolId ?? null,
      windowMs: opts.windowMs ?? null,
      eventCount: rows.length,
      uniqueProviders: perProvider.size,
      grossInflowUsd: round2(grossInflowUsd),
      grossOutflowUsd: round2(grossOutflowUsd),
      netLiquidityUsd: round2(grossInflowUsd - grossOutflowUsd),
      feesClaimedUsd: round2(feesClaimedUsd),
      topProviders,
    };
  }
}

export const liquidityProviderActivityFeedService = new LiquidityProviderActivityFeedService();
