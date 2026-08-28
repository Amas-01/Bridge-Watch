/**
 * Asset Supply Velocity Metrics Service
 * Issue #1155
 */

export interface AssetVelocityMetric {
  assetSymbol: string;
  chain: string;
  timeframe: "24h" | "7d" | "30d";
  turnoverRate: number; // 24h Volume / Total Supply
  circulationSpeed: number; // Active Volume / Circulating Supply
  totalTransfers: number;
  uniqueActiveAddresses: number;
  velocityScore: number; // 0 to 100 scale index
  calculatedAt: string;
}

export class AssetVelocityService {
  private velocityRecords: Map<string, AssetVelocityMetric> = new Map();

  public calculateVelocity(
    assetSymbol: string,
    chain: string,
    volume: number,
    totalSupply: number,
    activeVolume: number,
    circulatingSupply: number,
    totalTransfers: number,
    uniqueAddresses: number,
    timeframe: "24h" | "7d" | "30d" = "24h",
  ): AssetVelocityMetric {
    const turnoverRate = totalSupply > 0 ? Number((volume / totalSupply).toFixed(4)) : 0;
    const circulationSpeed =
      circulatingSupply > 0 ? Number((activeVolume / circulatingSupply).toFixed(4)) : 0;

    // Velocity score combines turnover, transfer intensity, and address activity
    const turnoverComponent = Math.min(50, turnoverRate * 100);
    const addressActivityComponent = Math.min(50, (uniqueAddresses / Math.max(1, totalTransfers)) * 50);
    const velocityScore = Number((turnoverComponent + addressActivityComponent).toFixed(2));

    const record: AssetVelocityMetric = {
      assetSymbol,
      chain,
      timeframe,
      turnoverRate,
      circulationSpeed,
      totalTransfers,
      uniqueActiveAddresses: uniqueAddresses,
      velocityScore,
      calculatedAt: new Date().toISOString(),
    };

    const key = `${chain}:${assetSymbol}:${timeframe}`;
    this.velocityRecords.set(key, record);
    return record;
  }

  public async getVelocityMetric(
    assetSymbol: string,
    chain: string,
    timeframe: "24h" | "7d" | "30d" = "24h",
  ): Promise<AssetVelocityMetric | null> {
    const key = `${chain}:${assetSymbol}:${timeframe}`;
    return this.velocityRecords.get(key) ?? null;
  }
}

export const assetVelocityService = new AssetVelocityService();
