import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import {
  liquidityRouteSimulationService,
  type RouteStep,
} from "./liquidityRouteSimulation.service.js";

// =============================================================================
// TYPES
// =============================================================================

export type QuoteStatus = "active" | "expired" | "consumed" | "superseded";

export interface RouteQuote {
  id: string;
  ownerAddress: string;
  sourceAsset: string;
  targetAsset: string;
  inputAmount: number;
  outputAmount: number | null;
  priceImpactPct: number | null;
  route: RouteStep[] | null;
  ttlSeconds: number;
  status: QuoteStatus;
  quotedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  supersededBy: string | null;
  refreshedFrom: string | null;
  /** Derived: seconds until `expiresAt`, floored at 0. */
  secondsRemaining: number;
  /** Derived: true once the quote may no longer be acted on. */
  isExpired: boolean;
}

export interface QuoteRequest {
  ownerAddress: string;
  sourceAsset: string;
  targetAsset: string;
  inputAmount: number;
  ttlSeconds?: number;
}

export class QuoteExpiredError extends Error {
  constructor(
    public readonly quoteId: string,
    public readonly expiredAt: Date
  ) {
    super(`Quote ${quoteId} expired at ${expiredAt.toISOString()}`);
    this.name = "QuoteExpiredError";
  }
}

export class QuoteNotFoundError extends Error {
  constructor(quoteId: string) {
    super(`Quote ${quoteId} not found`);
    this.name = "QuoteNotFoundError";
  }
}

export const DEFAULT_TTL_SECONDS = 30;
export const MAX_TTL_SECONDS = 300;

/** How a quote's route and pricing are produced. Swapped out in tests. */
export type Quoter = (request: QuoteRequest) => Promise<{
  route: RouteStep[];
  outputAmount: number;
  priceImpactPct: number;
}>;

// =============================================================================
// ROUTE QUOTE SERVICE (#1160)
// =============================================================================

/**
 * Route quotes are priced against pool reserves that move constantly, so a
 * quote is only honest for a few seconds. Every quote therefore carries a TTL,
 * and expiry is enforced in two places:
 *
 *   - lazily, on read and on consume — a quote past its horizon is transitioned
 *     to `expired` at the moment anyone looks at it, so a caller can never act
 *     on a stale price even if no sweep has run;
 *   - in bulk, via `expireStale()`, so the table does not accumulate quotes
 *     that are active-in-name-only.
 *
 * Refreshing does not overwrite the old quote: the replaced quote points
 * forward via `supersededBy`, so a client holding a stale id can be redirected
 * to the live one rather than simply told "gone".
 */
export class RouteQuoteService {
  constructor(private readonly quoter: Quoter = defaultQuoter) {}

  async createQuote(request: QuoteRequest): Promise<RouteQuote> {
    const db = getDatabase();
    const ttlSeconds = normalizeTtl(request.ttlSeconds);
    const quotedAt = new Date();
    const expiresAt = new Date(quotedAt.getTime() + ttlSeconds * 1000);

    const priced = await this.quoter(request);

    const [row] = await db("route_quotes")
      .insert({
        owner_address: request.ownerAddress,
        source_asset: request.sourceAsset,
        target_asset: request.targetAsset,
        input_amount: request.inputAmount,
        output_amount: priced.outputAmount,
        price_impact_pct: priced.priceImpactPct,
        route: JSON.stringify(priced.route),
        ttl_seconds: ttlSeconds,
        status: "active",
        quoted_at: quotedAt,
        expires_at: expiresAt,
      })
      .returning("*");

    logger.info(
      { quoteId: row.id, owner: request.ownerAddress, ttlSeconds },
      "Route quote issued"
    );
    return mapQuote(row);
  }

  /**
   * Read a quote, transitioning it to `expired` first if its horizon has passed.
   * Returns null when the id is unknown.
   */
  async getQuote(id: string, now: Date = new Date()): Promise<RouteQuote | null> {
    const db = getDatabase();
    const row = await db("route_quotes").where({ id }).first();
    if (!row) return null;

    if (row.status === "active" && new Date(row.expires_at) <= now) {
      await db("route_quotes").where({ id }).update({ status: "expired" });
      return mapQuote({ ...row, status: "expired" }, now);
    }
    return mapQuote(row, now);
  }

  async listQuotes(
    ownerAddress: string,
    options: { status?: QuoteStatus; limit?: number } = {}
  ): Promise<RouteQuote[]> {
    const db = getDatabase();
    let query = db("route_quotes").where({ owner_address: ownerAddress });
    if (options.status) query = query.where("status", options.status);

    const rows = await query
      .orderBy("quoted_at", "desc")
      .limit(Math.min(options.limit ?? 50, 200));
    return rows.map((row: Record<string, unknown>) => mapQuote(row));
  }

  /**
   * Re-price the same request and link the new quote to the old one. Works on
   * an expired quote too — that is the point: an expired quote is a refresh
   * request, not a dead end.
   */
  async refreshQuote(id: string, now: Date = new Date()): Promise<RouteQuote> {
    const db = getDatabase();
    const existing = await this.getQuote(id, now);
    if (!existing) throw new QuoteNotFoundError(id);
    if (existing.status === "consumed") {
      throw new Error(`Quote ${id} was already consumed and cannot be refreshed`);
    }
    // Already refreshed once — hand back the live quote rather than forking a
    // second replacement off the same parent.
    if (existing.supersededBy) {
      const successor = await this.getQuote(existing.supersededBy, now);
      if (successor && successor.status === "active") return successor;
    }

    const replacement = await this.createQuote({
      ownerAddress: existing.ownerAddress,
      sourceAsset: existing.sourceAsset,
      targetAsset: existing.targetAsset,
      inputAmount: existing.inputAmount,
      ttlSeconds: existing.ttlSeconds,
    });

    await db("route_quotes")
      .where({ id: replacement.id })
      .update({ refreshed_from: id });
    await db("route_quotes")
      .where({ id })
      .update({ status: "superseded", superseded_by: replacement.id });

    logger.info({ from: id, to: replacement.id }, "Route quote refreshed");
    return { ...replacement, refreshedFrom: id };
  }

  /**
   * Mark a quote as acted on. Throws `QuoteExpiredError` when the quote is past
   * its horizon — the caller is meant to refresh and retry.
   */
  async consumeQuote(id: string, now: Date = new Date()): Promise<RouteQuote> {
    const db = getDatabase();
    const quote = await this.getQuote(id, now);
    if (!quote) throw new QuoteNotFoundError(id);

    if (quote.status !== "active" || quote.isExpired) {
      throw new QuoteExpiredError(id, quote.expiresAt);
    }

    await db("route_quotes")
      .where({ id, status: "active" })
      .update({ status: "consumed", consumed_at: now });

    return { ...quote, status: "consumed", consumedAt: now, secondsRemaining: 0 };
  }

  /**
   * Bulk sweep for active quotes whose horizon has passed. Returns how many
   * were transitioned.
   */
  async expireStale(now: Date = new Date()): Promise<number> {
    const db = getDatabase();
    const updated = await db("route_quotes")
      .where("status", "active")
      .where("expires_at", "<=", now)
      .update({ status: "expired" });

    const count = Number(updated ?? 0);
    if (count > 0) logger.info({ count }, "Expired stale route quotes");
    return count;
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function normalizeTtl(ttlSeconds?: number): number {
  if (!ttlSeconds || !Number.isFinite(ttlSeconds)) return DEFAULT_TTL_SECONDS;
  return Math.min(Math.max(Math.floor(ttlSeconds), 1), MAX_TTL_SECONDS);
}

const defaultQuoter: Quoter = async (request) => {
  const simulation = await liquidityRouteSimulationService.simulate(
    request.ownerAddress,
    request.sourceAsset,
    request.targetAsset,
    request.inputAmount
  );
  return {
    route: simulation.result ?? [],
    outputAmount: simulation.outputAmount ?? 0,
    priceImpactPct: simulation.priceImpactPct ?? 0,
  };
};

function mapQuote(row: Record<string, unknown>, now: Date = new Date()): RouteQuote {
  const expiresAt = new Date(row.expires_at as string | Date);
  const status = row.status as QuoteStatus;
  const secondsRemaining = Math.max(
    0,
    Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
  );

  return {
    id: row.id as string,
    ownerAddress: row.owner_address as string,
    sourceAsset: row.source_asset as string,
    targetAsset: row.target_asset as string,
    inputAmount: Number(row.input_amount),
    outputAmount: row.output_amount != null ? Number(row.output_amount) : null,
    priceImpactPct: row.price_impact_pct != null ? Number(row.price_impact_pct) : null,
    route:
      typeof row.route === "string"
        ? (JSON.parse(row.route) as RouteStep[])
        : ((row.route as RouteStep[] | null) ?? null),
    ttlSeconds: Number(row.ttl_seconds),
    status,
    quotedAt: new Date(row.quoted_at as string | Date),
    expiresAt,
    consumedAt: row.consumed_at ? new Date(row.consumed_at as string | Date) : null,
    supersededBy: (row.superseded_by as string | null) ?? null,
    refreshedFrom: (row.refreshed_from as string | null) ?? null,
    secondsRemaining: status === "active" ? secondsRemaining : 0,
    isExpired: status !== "active" || expiresAt <= now,
  };
}

export const routeQuoteService = new RouteQuoteService();
