/**
 * Holder Distribution Snapshots Service
 * Issue #1154
 */

export interface HolderTierDistribution {
  whalesPct: number; // >1% of supply
  dolphinsPct: number; // 0.1% - 1% of supply
  retailPct: number; // <0.1% of supply
}

export interface ConcentrationPercentiles {
  top1PctShare: number;
  top10PctShare: number;
  top50PctShare: number;
}

export interface HolderDistributionSnapshot {
  id: string;
  assetAddress: string;
  chain: string;
  totalHolders: number;
  totalSupply: string;
  giniCoefficient: number;
  concentration: ConcentrationPercentiles;
  tierDistribution: HolderTierDistribution;
  timestamp: string;
}

export class HolderDistributionService {
  private snapshots: Map<string, HolderDistributionSnapshot[]> = new Map();

  /**
   * Calculate Gini coefficient from balance arrays (0 = perfect equality, 1 = total concentration)
   */
  public calculateGiniCoefficient(balances: number[]): number {
    if (!balances || balances.length === 0) return 0;
    const sorted = [...balances].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    if (sum === 0) return 0;

    let cumulativeSum = 0;
    for (let i = 0; i < n; i++) {
      cumulativeSum += (2 * (i + 1) - n - 1) * sorted[i];
    }

    const gini = cumulativeSum / (n * sum);
    return Number(Math.max(0, Math.min(1, gini)).toFixed(4));
  }

  public async recordSnapshot(
    assetAddress: string,
    chain: string,
    balances: number[],
  ): Promise<HolderDistributionSnapshot> {
    const key = `${chain}:${assetAddress}`;
    const totalHolders = balances.length;
    const total = balances.reduce((a, b) => a + b, 0);
    const sorted = [...balances].sort((a, b) => b - a);

    const top1Count = Math.max(1, Math.floor(totalHolders * 0.01));
    const top10Count = Math.max(1, Math.floor(totalHolders * 0.1));
    const top50Count = Math.max(1, Math.floor(totalHolders * 0.5));

    const top1Sum = sorted.slice(0, top1Count).reduce((a, b) => a + b, 0);
    const top10Sum = sorted.slice(0, top10Count).reduce((a, b) => a + b, 0);
    const top50Sum = sorted.slice(0, top50Count).reduce((a, b) => a + b, 0);

    const whales = balances.filter((b) => b / total > 0.01).reduce((a, b) => a + b, 0);
    const dolphins = balances
      .filter((b) => b / total >= 0.001 && b / total <= 0.01)
      .reduce((a, b) => a + b, 0);
    const retail = total - whales - dolphins;

    const snapshot: HolderDistributionSnapshot = {
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      assetAddress,
      chain,
      totalHolders,
      totalSupply: total.toString(),
      giniCoefficient: this.calculateGiniCoefficient(balances),
      concentration: {
        top1PctShare: total === 0 ? 0 : Number(((top1Sum / total) * 100).toFixed(2)),
        top10PctShare: total === 0 ? 0 : Number(((top10Sum / total) * 100).toFixed(2)),
        top50PctShare: total === 0 ? 0 : Number(((top50Sum / total) * 100).toFixed(2)),
      },
      tierDistribution: {
        whalesPct: total === 0 ? 0 : Number(((whales / total) * 100).toFixed(2)),
        dolphinsPct: total === 0 ? 0 : Number(((dolphins / total) * 100).toFixed(2)),
        retailPct: total === 0 ? 0 : Number(((retail / total) * 100).toFixed(2)),
      },
      timestamp: new Date().toISOString(),
    };

    const list = this.snapshots.get(key) ?? [];
    list.push(snapshot);
    this.snapshots.set(key, list);

    return snapshot;
  }

  public async getLatestSnapshot(
    assetAddress: string,
    chain: string,
  ): Promise<HolderDistributionSnapshot | null> {
    const key = `${chain}:${assetAddress}`;
    const list = this.snapshots.get(key);
    if (!list || list.length === 0) return null;
    return list[list.length - 1];
  }

  public async getHistoricalSnapshots(
    assetAddress: string,
    chain: string,
  ): Promise<HolderDistributionSnapshot[]> {
    const key = `${chain}:${assetAddress}`;
    return this.snapshots.get(key) ?? [];
  }
}

export const holderDistributionService = new HolderDistributionService();
