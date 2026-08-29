export interface ChainExposure {
  chain: string;
  exposureUsd: number;
  sharePercentage: number;
  riskScore: number;
}

export interface BridgeExposure {
  bridge: string;
  exposureUsd: number;
  sharePercentage: number;
  status: "healthy" | "warning" | "critical";
}

export interface CustodianExposure {
  custodian: string;
  exposureUsd: number;
  sharePercentage: number;
}

export interface ExposureSummary {
  totalExposureUsd: number;
  hhiScore: number; // Herfindahl-Hirschman Index (0 - 10,000)
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  topChainExposure: ChainExposure;
  topBridgeExposure: BridgeExposure;
  updatedAt: string;
}

export interface ExposureBreakdown {
  chains: ChainExposure[];
  bridges: BridgeExposure[];
  custodians: CustodianExposure[];
}

export interface RebalanceAlertConfig {
  maxChainConcentrationPct: number;
  maxBridgeConcentrationPct: number;
  alertEmailEnabled: boolean;
  alertWebhookUrl?: string;
}

let alertConfig: RebalanceAlertConfig = {
  maxChainConcentrationPct: 40,
  maxBridgeConcentrationPct: 35,
  alertEmailEnabled: true,
};

export class AssetExposureService {
  public async getSummary(): Promise<ExposureSummary> {
    const breakdown = await this.getBreakdown();
    const totalExposure = breakdown.chains.reduce((acc, c) => acc + c.exposureUsd, 0);

    // Calculate Herfindahl-Hirschman Index (HHI) for chain shares: sum of (sharePct * 100)^2
    const hhiScore = Math.round(
      breakdown.chains.reduce((sum, c) => sum + Math.pow(c.sharePercentage, 2), 0)
    );

    let riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
    if (hhiScore > 3500) riskLevel = "CRITICAL";
    else if (hhiScore > 2500) riskLevel = "HIGH";
    else if (hhiScore > 1800) riskLevel = "MEDIUM";

    return {
      totalExposureUsd: totalExposure,
      hhiScore,
      riskLevel,
      topChainExposure: breakdown.chains[0],
      topBridgeExposure: breakdown.bridges[0],
      updatedAt: new Date().toISOString(),
    };
  }

  public async getBreakdown(): Promise<ExposureBreakdown> {
    const chains: ChainExposure[] = [
      { chain: "Stellar", exposureUsd: 45000000, sharePercentage: 45.0, riskScore: 12 },
      { chain: "Ethereum", exposureUsd: 30000000, sharePercentage: 30.0, riskScore: 18 },
      { chain: "Solana", exposureUsd: 15000000, sharePercentage: 15.0, riskScore: 25 },
      { chain: "Polygon", exposureUsd: 10000000, sharePercentage: 10.0, riskScore: 15 },
    ];

    const bridges: BridgeExposure[] = [
      { bridge: "StellarX Bridge", exposureUsd: 40000000, sharePercentage: 40.0, status: "healthy" },
      { bridge: "Pendulum Spacewalk", exposureUsd: 35000000, sharePercentage: 35.0, status: "healthy" },
      { bridge: "Allbridge Core", exposureUsd: 15000000, sharePercentage: 15.0, status: "warning" },
      { bridge: "Axelar Gateway", exposureUsd: 10000000, sharePercentage: 10.0, status: "healthy" },
    ];

    const custodians: CustodianExposure[] = [
      { custodian: "Fireblocks", exposureUsd: 50000000, sharePercentage: 50.0 },
      { custodian: "BitGo", exposureUsd: 30000000, sharePercentage: 30.0 },
      { custodian: "Copper.co", exposureUsd: 20000000, sharePercentage: 20.0 },
    ];

    return { chains, bridges, custodians };
  }

  public async updateAlertConfig(newConfig: Partial<RebalanceAlertConfig>): Promise<RebalanceAlertConfig> {
    alertConfig = { ...alertConfig, ...newConfig };
    return alertConfig;
  }

  public async getAlertConfig(): Promise<RebalanceAlertConfig> {
    return alertConfig;
  }
}

export const assetExposureService = new AssetExposureService();
