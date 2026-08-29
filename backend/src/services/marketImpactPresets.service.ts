import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export interface MarketImpactPreset {
  id: string;
  name: string;
  description: string | null;
  tradeSizeUsd: number;
  slippageTolerancePct: number;
  isSystem: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PresetInput {
  name: string;
  description?: string | null;
  tradeSizeUsd: number;
  slippageTolerancePct: number;
  createdBy?: string | null;
}

export interface ScenarioResult {
  preset: Pick<
    MarketImpactPreset,
    "id" | "name" | "tradeSizeUsd" | "slippageTolerancePct"
  >;
  poolKey: string;
  dex: string;
  pair: string;
  /** Pool depth in USD at evaluation time. */
  poolLiquidityUsd: number;
  /** Trade size as a share of pool depth — the driver of the impact number. */
  tradeSharePct: number;
  /** Price move the trade itself causes, before fees. */
  priceImpactPct: number;
  /** Impact plus the pool's swap fee: what the trader actually gives up. */
  effectiveSlippagePct: number;
  /** Value lost to impact and fees, in USD. */
  estimatedCostUsd: number;
  withinTolerance: boolean;
  severity: "low" | "moderate" | "high" | "severe";
}

export class PresetNotFoundError extends Error {
  constructor(message = "Market impact preset not found") {
    super(message);
    this.name = "PresetNotFoundError";
  }
}

/** Shipped presets, created on first use so a fresh install is not empty. */
const SYSTEM_PRESETS: PresetInput[] = [
  {
    name: "Retail",
    description: "A typical end-user swap.",
    tradeSizeUsd: 1_000,
    slippageTolerancePct: 0.5,
  },
  {
    name: "Desk",
    description: "A trading desk clip.",
    tradeSizeUsd: 50_000,
    slippageTolerancePct: 1,
  },
  {
    name: "Institutional",
    description: "A treasury rebalance in one hop.",
    tradeSizeUsd: 250_000,
    slippageTolerancePct: 2,
  },
  {
    name: "Stress",
    description: "Exit-the-pool scenario used to size worst-case impact.",
    tradeSizeUsd: 1_000_000,
    slippageTolerancePct: 5,
  },
];

// =============================================================================
// IMPACT MODEL (pure)
// =============================================================================

/**
 * Constant-product price impact for a trade of `tradeSizeUsd` against a pool
 * holding `poolLiquidityUsd`.
 *
 * A two-sided constant-product pool holds half its value on each side, so the
 * input reserve is `poolLiquidityUsd / 2`. For input `dx` into reserve `x`, the
 * execution price degrades by `dx / (x + dx)` — which is the impact, and which
 * approaches 100% rather than exploding as the trade approaches pool size.
 */
export function computePriceImpactPct(
  tradeSizeUsd: number,
  poolLiquidityUsd: number
): number {
  if (poolLiquidityUsd <= 0) return 100;
  const inputReserve = poolLiquidityUsd / 2;
  return (tradeSizeUsd / (inputReserve + tradeSizeUsd)) * 100;
}

export function severityFor(effectiveSlippagePct: number): ScenarioResult["severity"] {
  if (effectiveSlippagePct < 0.5) return "low";
  if (effectiveSlippagePct < 2) return "moderate";
  if (effectiveSlippagePct < 10) return "high";
  return "severe";
}

// =============================================================================
// MARKET IMPACT PRESETS SERVICE (#1159)
// =============================================================================

export class MarketImpactPresetsService {
  /**
   * Insert the shipped presets if they are missing. Idempotent, so it is safe
   * to call on every list.
   */
  async seedSystemPresets(): Promise<void> {
    const db = getDatabase();
    for (const preset of SYSTEM_PRESETS) {
      const existing = await db("market_impact_presets")
        .where({ name: preset.name })
        .first();
      if (existing) continue;

      await db("market_impact_presets").insert({
        name: preset.name,
        description: preset.description ?? null,
        trade_size_usd: preset.tradeSizeUsd,
        slippage_tolerance_pct: preset.slippageTolerancePct,
        is_system: true,
      });
    }
  }

  async listPresets(): Promise<MarketImpactPreset[]> {
    const db = getDatabase();
    const rows = await db("market_impact_presets").orderBy("trade_size_usd", "asc");
    return rows.map(mapPreset);
  }

  async getPreset(id: string): Promise<MarketImpactPreset | null> {
    const db = getDatabase();
    const row = await db("market_impact_presets").where({ id }).first();
    return row ? mapPreset(row) : null;
  }

  async createPreset(input: PresetInput): Promise<MarketImpactPreset> {
    const db = getDatabase();
    const [row] = await db("market_impact_presets")
      .insert({
        name: input.name,
        description: input.description ?? null,
        trade_size_usd: input.tradeSizeUsd,
        slippage_tolerance_pct: input.slippageTolerancePct,
        is_system: false,
        created_by: input.createdBy ?? null,
      })
      .returning("*");

    logger.info({ name: input.name }, "Market impact preset created");
    return mapPreset(row);
  }

  async updatePreset(
    id: string,
    changes: Partial<Omit<PresetInput, "createdBy">>
  ): Promise<MarketImpactPreset> {
    const db = getDatabase();
    const existing = await db("market_impact_presets").where({ id }).first();
    if (!existing) throw new PresetNotFoundError();
    if (existing.is_system) {
      throw new Error("System presets cannot be modified");
    }

    const [row] = await db("market_impact_presets")
      .where({ id })
      .update({
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.description !== undefined
          ? { description: changes.description }
          : {}),
        ...(changes.tradeSizeUsd !== undefined
          ? { trade_size_usd: changes.tradeSizeUsd }
          : {}),
        ...(changes.slippageTolerancePct !== undefined
          ? { slippage_tolerance_pct: changes.slippageTolerancePct }
          : {}),
        updated_at: new Date(),
      })
      .returning("*");
    return mapPreset(row);
  }

  async deletePreset(id: string): Promise<void> {
    const db = getDatabase();
    const existing = await db("market_impact_presets").where({ id }).first();
    if (!existing) throw new PresetNotFoundError();
    if (existing.is_system) {
      throw new Error("System presets cannot be deleted");
    }
    await db("market_impact_presets").where({ id }).delete();
  }

  /**
   * Run a preset against every pool for an asset pair (or one named pool),
   * ranked worst impact first — the pool that hurts most is the one an operator
   * needs to see.
   */
  async applyPreset(
    presetId: string,
    filters: { poolId?: string; assetA?: string; assetB?: string } = {}
  ): Promise<ScenarioResult[]> {
    const db = getDatabase();
    const preset = await this.getPreset(presetId);
    if (!preset) throw new PresetNotFoundError();

    let query = db("liquidity_pools");
    if (filters.poolId) query = query.where("id", filters.poolId);
    if (filters.assetA) query = query.where("asset_a", filters.assetA);
    if (filters.assetB) query = query.where("asset_b", filters.assetB);
    const pools = await query.select("*");

    return pools
      .map((pool: Record<string, unknown>) =>
        evaluateScenario(preset, {
          poolKey: String(pool.id),
          dex: String(pool.dex),
          pair: `${pool.asset_a}/${pool.asset_b}`,
          liquidityUsd: Number(pool.total_liquidity ?? 0),
          fee: Number(pool.fee ?? 0),
        })
      )
      .sort((a, b) => b.effectiveSlippagePct - a.effectiveSlippagePct);
  }
}

/**
 * Evaluate one preset against one pool. Pure — the arithmetic is the part worth
 * testing, and it needs no database.
 */
export function evaluateScenario(
  preset: Pick<
    MarketImpactPreset,
    "id" | "name" | "tradeSizeUsd" | "slippageTolerancePct"
  >,
  pool: {
    poolKey: string;
    dex: string;
    pair: string;
    liquidityUsd: number;
    fee: number;
  }
): ScenarioResult {
  const priceImpactPct = computePriceImpactPct(preset.tradeSizeUsd, pool.liquidityUsd);
  // Round before deriving the cost so the reported numbers agree with each
  // other: a reader recomputing size x slippage should land on the same USD.
  const effectiveSlippagePct = round4(priceImpactPct + pool.fee * 100);

  return {
    preset: {
      id: preset.id,
      name: preset.name,
      tradeSizeUsd: preset.tradeSizeUsd,
      slippageTolerancePct: preset.slippageTolerancePct,
    },
    poolKey: pool.poolKey,
    dex: pool.dex,
    pair: pool.pair,
    poolLiquidityUsd: pool.liquidityUsd,
    tradeSharePct:
      pool.liquidityUsd > 0 ? (preset.tradeSizeUsd / pool.liquidityUsd) * 100 : 100,
    priceImpactPct: round4(priceImpactPct),
    effectiveSlippagePct,
    estimatedCostUsd: round4((preset.tradeSizeUsd * effectiveSlippagePct) / 100),
    withinTolerance: effectiveSlippagePct <= preset.slippageTolerancePct,
    severity: severityFor(effectiveSlippagePct),
  };
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

function mapPreset(row: Record<string, unknown>): MarketImpactPreset {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    tradeSizeUsd: Number(row.trade_size_usd),
    slippageTolerancePct: Number(row.slippage_tolerance_pct),
    isSystem: Boolean(row.is_system),
    createdBy: (row.created_by as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}

export const marketImpactPresetsService = new MarketImpactPresetsService();
