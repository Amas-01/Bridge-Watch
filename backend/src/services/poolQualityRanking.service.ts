import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export type QualityGrade = "A" | "B" | "C" | "D" | "F";

/** The pool facts a score is derived from. */
export interface PoolQualityInput {
  poolKey: string;
  dex: string;
  totalLiquidity: number;
  volume24h: number;
  fee: number;
  healthScore: number;
  lastUpdated: Date;
}

export interface QualityComponents {
  depthScore: number;
  volumeScore: number;
  feeScore: number;
  stabilityScore: number;
  freshnessScore: number;
}

export interface PoolQualityScore extends QualityComponents {
  id?: string;
  poolKey: string;
  dex: string;
  totalScore: number;
  grade: QualityGrade;
  rank: number;
  inputs: Record<string, unknown>;
  computedAt: Date;
}

/**
 * Component weights. They sum to 1, so `totalScore` stays on the 0-100 scale
 * every component uses and a component's contribution is readable directly.
 */
export const QUALITY_WEIGHTS: Record<keyof QualityComponents, number> = {
  depthScore: 0.35,
  volumeScore: 0.25,
  stabilityScore: 0.2,
  feeScore: 0.1,
  freshnessScore: 0.1,
};

/** Liquidity (USD) at which the depth component saturates at 100. */
const DEPTH_SATURATION_USD = 10_000_000;
/** Daily turnover (volume / TVL) at which the volume component saturates. */
const TURNOVER_SATURATION = 0.5;
/** Fee at or above which the fee component bottoms out (1%). */
const FEE_CEILING = 0.01;
/** Age at which the freshness component reaches zero. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

// =============================================================================
// SCORING (pure)
// =============================================================================

const clamp = (n: number, min = 0, max = 100): number =>
  Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;

/**
 * Score one pool. Pure so the weighting can be reasoned about — and tested —
 * without a database.
 *
 * Depth uses a log curve: the difference between a $10k and a $100k pool
 * matters far more than between $5m and $10m, and a linear scale would collapse
 * every mid-sized pool into the same near-zero score.
 */
export function scorePool(pool: PoolQualityInput, now: Date = new Date()): QualityComponents & {
  totalScore: number;
  grade: QualityGrade;
} {
  const liquidity = Math.max(0, pool.totalLiquidity);
  const depthScore = clamp(
    (Math.log10(1 + liquidity) / Math.log10(1 + DEPTH_SATURATION_USD)) * 100
  );

  const turnover = liquidity > 0 ? Math.max(0, pool.volume24h) / liquidity : 0;
  const volumeScore = clamp((turnover / TURNOVER_SATURATION) * 100);

  const feeScore = clamp((1 - Math.max(0, pool.fee) / FEE_CEILING) * 100);

  const stabilityScore = clamp(pool.healthScore);

  const ageMs = now.getTime() - new Date(pool.lastUpdated).getTime();
  const freshnessScore = clamp((1 - Math.max(0, ageMs) / STALE_AFTER_MS) * 100);

  const components: QualityComponents = {
    depthScore,
    volumeScore,
    feeScore,
    stabilityScore,
    freshnessScore,
  };

  const totalScore = round2(
    (Object.keys(QUALITY_WEIGHTS) as (keyof QualityComponents)[]).reduce(
      (sum, key) => sum + components[key] * QUALITY_WEIGHTS[key],
      0
    )
  );

  return {
    depthScore: round2(depthScore),
    volumeScore: round2(volumeScore),
    feeScore: round2(feeScore),
    stabilityScore: round2(stabilityScore),
    freshnessScore: round2(freshnessScore),
    totalScore,
    grade: toGrade(totalScore),
  };
}

export function toGrade(totalScore: number): QualityGrade {
  if (totalScore >= 85) return "A";
  if (totalScore >= 70) return "B";
  if (totalScore >= 55) return "C";
  if (totalScore >= 40) return "D";
  return "F";
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// =============================================================================
// POOL QUALITY RANKING SERVICE (#1158)
// =============================================================================

/**
 * Ranks the pools Bridge Watch tracks and keeps each ranking as a dated batch,
 * so "why was this pool rated a C last Tuesday" stays answerable.
 */
export class PoolQualityRankingService {
  /**
   * Score every known pool and persist the batch. Returns the ranking, best
   * first.
   */
  async computeRanking(options: { dex?: string } = {}): Promise<PoolQualityScore[]> {
    const db = getDatabase();
    const computedAt = new Date();

    let query = db("liquidity_pools");
    if (options.dex) query = query.where("dex", options.dex);
    const rows = await query.select("*");

    const scored = rows
      .map((row: Record<string, unknown>) => {
        const input: PoolQualityInput = {
          poolKey: String(row.id),
          dex: String(row.dex),
          totalLiquidity: Number(row.total_liquidity ?? 0),
          volume24h: Number(row.volume_24h ?? 0),
          fee: Number(row.fee ?? 0),
          healthScore: Number(row.health_score ?? 0),
          lastUpdated: (row.last_updated as Date) ?? computedAt,
        };
        return { input, scores: scorePool(input, computedAt) };
      })
      .sort((a, b) => b.scores.totalScore - a.scores.totalScore);

    const ranked: PoolQualityScore[] = scored.map(({ input, scores }, index) => ({
      poolKey: input.poolKey,
      dex: input.dex,
      ...scores,
      rank: index + 1,
      inputs: {
        totalLiquidity: input.totalLiquidity,
        volume24h: input.volume24h,
        fee: input.fee,
        healthScore: input.healthScore,
        lastUpdated: input.lastUpdated,
      },
      computedAt,
    }));

    if (ranked.length > 0) {
      await db("pool_quality_scores").insert(
        ranked.map((r) => ({
          pool_key: r.poolKey,
          dex: r.dex,
          depth_score: r.depthScore,
          volume_score: r.volumeScore,
          fee_score: r.feeScore,
          stability_score: r.stabilityScore,
          freshness_score: r.freshnessScore,
          total_score: r.totalScore,
          grade: r.grade,
          rank: r.rank,
          inputs: JSON.stringify(r.inputs),
          computed_at: computedAt,
        }))
      );
    }

    logger.info(
      { dex: options.dex ?? "all", pools: ranked.length },
      "Pool quality ranking computed"
    );
    return ranked;
  }

  /**
   * The most recent ranking batch. Empty until `computeRanking` has run.
   */
  async getLatestRanking(options: { dex?: string; limit?: number } = {}): Promise<
    PoolQualityScore[]
  > {
    const db = getDatabase();

    let latestQuery = db("pool_quality_scores");
    if (options.dex) latestQuery = latestQuery.where("dex", options.dex);
    const latest = await latestQuery.orderBy("computed_at", "desc").first();
    if (!latest) return [];

    let query = db("pool_quality_scores").where("computed_at", latest.computed_at);
    if (options.dex) query = query.where("dex", options.dex);

    const rows = await query
      .orderBy("rank", "asc")
      .limit(Math.min(options.limit ?? 100, 500));
    return rows.map(mapScore);
  }

  /** Score history for one pool, newest first. */
  async getPoolHistory(poolKey: string, limit = 30): Promise<PoolQualityScore[]> {
    const db = getDatabase();
    const rows = await db("pool_quality_scores")
      .where({ pool_key: poolKey })
      .orderBy("computed_at", "desc")
      .limit(Math.min(limit, 200));
    return rows.map(mapScore);
  }
}

function mapScore(row: Record<string, unknown>): PoolQualityScore {
  return {
    id: row.id as string,
    poolKey: row.pool_key as string,
    dex: row.dex as string,
    depthScore: Number(row.depth_score),
    volumeScore: Number(row.volume_score),
    feeScore: Number(row.fee_score),
    stabilityScore: Number(row.stability_score),
    freshnessScore: Number(row.freshness_score),
    totalScore: Number(row.total_score),
    grade: row.grade as QualityGrade,
    rank: Number(row.rank),
    inputs:
      typeof row.inputs === "string"
        ? (JSON.parse(row.inputs) as Record<string, unknown>)
        : ((row.inputs as Record<string, unknown>) ?? {}),
    computedAt: row.computed_at as Date,
  };
}

export const poolQualityRankingService = new PoolQualityRankingService();
