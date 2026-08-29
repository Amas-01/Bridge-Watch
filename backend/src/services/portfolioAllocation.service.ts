/**
 * Asset Portfolio Allocation View Service
 * Issue #1132
 *
 * Computes how a monitored portfolio's USD value is distributed across
 * individual assets, chains and asset classes. Surfaces concentration risk,
 * a diversification score and (when target weights are supplied) allocation
 * drift plus the trade size needed to rebalance each position.
 *
 * Storage is in-memory and keyed by portfolioId; callers own persistence.
 */

export type AssetClass = "stablecoin" | "rwa" | "native" | "wrapped" | "other";

export interface PortfolioPosition {
  assetSymbol: string;
  chain: string;
  assetClass?: AssetClass;
  quantity: number;
  priceUsd: number;
  /** Optional desired allocation (0-100) used for drift and rebalance hints. */
  targetWeightPct?: number;
}

export interface AllocationSlice {
  key: string;
  valueUsd: number;
  weightPct: number;
}

export interface PositionAllocation extends AllocationSlice {
  assetSymbol: string;
  chain: string;
  assetClass: AssetClass;
  quantity: number;
  priceUsd: number;
  targetWeightPct: number | null;
  /** weightPct - targetWeightPct, null when no target supplied. */
  driftPct: number | null;
  /** USD to buy (+) or sell (-) to reach the target weight, null when no target. */
  rebalanceActionUsd: number | null;
}

export type ConcentrationRisk = "low" | "medium" | "high";

export interface PortfolioAllocationView {
  portfolioId: string;
  totalValueUsd: number;
  positionCount: number;
  positions: PositionAllocation[];
  byChain: AllocationSlice[];
  byAssetClass: AllocationSlice[];
  largestPositionPct: number;
  /** Herfindahl-Hirschman index of position weights, 0 (spread) to 1 (single asset). */
  herfindahlIndex: number;
  /** 0-100, higher means more evenly diversified. */
  diversificationScore: number;
  concentrationRisk: ConcentrationRisk;
  concentrationFlags: string[];
  computedAt: string;
}

const round2 = (n: number): number => Number(n.toFixed(2));
const round4 = (n: number): number => Number(n.toFixed(4));

export class PortfolioAllocationService {
  private views: Map<string, PortfolioAllocationView> = new Map();

  public computeAllocation(
    portfolioId: string,
    positions: PortfolioPosition[],
  ): PortfolioAllocationView {
    if (!portfolioId || typeof portfolioId !== "string") {
      throw new Error("portfolioId is required");
    }
    if (!Array.isArray(positions) || positions.length === 0) {
      throw new Error("At least one position is required");
    }

    for (const p of positions) {
      if (!p.assetSymbol || !p.chain) {
        throw new Error("Each position needs assetSymbol and chain");
      }
      if (!Number.isFinite(p.quantity) || p.quantity < 0) {
        throw new Error(`Invalid quantity for ${p.assetSymbol}`);
      }
      if (!Number.isFinite(p.priceUsd) || p.priceUsd < 0) {
        throw new Error(`Invalid priceUsd for ${p.assetSymbol}`);
      }
      if (
        p.targetWeightPct !== undefined &&
        (!Number.isFinite(p.targetWeightPct) || p.targetWeightPct < 0 || p.targetWeightPct > 100)
      ) {
        throw new Error(`targetWeightPct for ${p.assetSymbol} must be between 0 and 100`);
      }
    }

    const values = positions.map((p) => p.quantity * p.priceUsd);
    const totalValueUsd = values.reduce((a, b) => a + b, 0);
    if (totalValueUsd <= 0) {
      throw new Error("Portfolio has no positive USD value");
    }

    const positionAllocations: PositionAllocation[] = positions.map((p, i) => {
      const valueUsd = values[i];
      const weightPct = (valueUsd / totalValueUsd) * 100;
      const assetClass: AssetClass = p.assetClass ?? "other";
      const hasTarget = p.targetWeightPct !== undefined;
      const targetWeightPct = hasTarget ? (p.targetWeightPct as number) : null;
      const driftPct = hasTarget ? round2(weightPct - (targetWeightPct as number)) : null;
      const rebalanceActionUsd = hasTarget
        ? round2(((targetWeightPct as number) / 100) * totalValueUsd - valueUsd)
        : null;

      return {
        key: `${p.chain}:${p.assetSymbol}`,
        assetSymbol: p.assetSymbol,
        chain: p.chain,
        assetClass,
        quantity: p.quantity,
        priceUsd: p.priceUsd,
        valueUsd: round2(valueUsd),
        weightPct: round2(weightPct),
        targetWeightPct,
        driftPct,
        rebalanceActionUsd,
      };
    });

    positionAllocations.sort((a, b) => b.valueUsd - a.valueUsd);

    const byChain = this.groupBy(positionAllocations, totalValueUsd, (p) => p.chain);
    const byAssetClass = this.groupBy(positionAllocations, totalValueUsd, (p) => p.assetClass);

    const weights = positionAllocations.map((p) => p.weightPct / 100);
    const herfindahlIndex = round4(weights.reduce((acc, w) => acc + w * w, 0));
    const largestPositionPct = positionAllocations[0]?.weightPct ?? 0;

    // Normalize HHI against an evenly split portfolio of the same size.
    const n = positionAllocations.length;
    const evenHhi = 1 / n;
    const diversificationScore =
      n <= 1
        ? 0
        : round2(
            Math.max(
              0,
              Math.min(100, ((1 - herfindahlIndex) / (1 - evenHhi)) * 100),
            ),
          );

    const concentrationFlags: string[] = [];
    if (largestPositionPct >= 40) {
      concentrationFlags.push(
        `Largest position is ${largestPositionPct}% of the portfolio (>= 40%)`,
      );
    }
    if (herfindahlIndex >= 0.25) {
      concentrationFlags.push(`HHI ${herfindahlIndex} indicates a concentrated portfolio`);
    }
    const top3 = positionAllocations.slice(0, 3).reduce((acc, p) => acc + p.weightPct, 0);
    if (n >= 4 && top3 >= 80) {
      concentrationFlags.push(`Top 3 positions hold ${round2(top3)}% of the portfolio`);
    }

    let concentrationRisk: ConcentrationRisk = "low";
    if (largestPositionPct >= 40 || herfindahlIndex >= 0.25) {
      concentrationRisk = "high";
    } else if (largestPositionPct >= 25 || herfindahlIndex >= 0.15) {
      concentrationRisk = "medium";
    }

    const view: PortfolioAllocationView = {
      portfolioId,
      totalValueUsd: round2(totalValueUsd),
      positionCount: n,
      positions: positionAllocations,
      byChain,
      byAssetClass,
      largestPositionPct,
      herfindahlIndex,
      diversificationScore,
      concentrationRisk,
      concentrationFlags,
      computedAt: new Date().toISOString(),
    };

    this.views.set(portfolioId, view);
    return view;
  }

  public getAllocation(portfolioId: string): PortfolioAllocationView | null {
    return this.views.get(portfolioId) ?? null;
  }

  private groupBy(
    positions: PositionAllocation[],
    totalValueUsd: number,
    keyFn: (p: PositionAllocation) => string,
  ): AllocationSlice[] {
    const buckets = new Map<string, number>();
    for (const p of positions) {
      const k = keyFn(p);
      buckets.set(k, (buckets.get(k) ?? 0) + p.valueUsd);
    }
    return [...buckets.entries()]
      .map(([key, valueUsd]) => ({
        key,
        valueUsd: round2(valueUsd),
        weightPct: round2((valueUsd / totalValueUsd) * 100),
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd);
  }
}

export const portfolioAllocationService = new PortfolioAllocationService();
