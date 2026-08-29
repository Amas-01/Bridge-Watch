export interface BridgeSLAMetric {
  bridge: string;
  sourceChain: string;
  targetChain: string;
  p50DurationSec: number;
  p90DurationSec: number;
  p99DurationSec: number;
  slaTargetSec: number;
  compliancePercentage: number;
  totalTransfers: number;
  breachedTransfers: number;
}

export interface SLABreachIncident {
  id: string;
  bridge: string;
  txHash: string;
  sourceChain: string;
  targetChain: string;
  expectedDurationSec: number;
  actualDurationSec: number;
  status: "INVESTIGATING" | "RESOLVED" | "EXCUSED";
  timestamp: string;
}

export interface SLAConfig {
  defaultTargetSec: number;
  alertOnBreachRatePct: number;
  autoEscalateAfterBreaches: number;
}

let slaConfig: SLAConfig = {
  defaultTargetSec: 180,
  alertOnBreachRatePct: 5.0,
  autoEscalateAfterBreaches: 3,
};

export class TransferSLAService {
  public async getSLAMetrics(): Promise<BridgeSLAMetric[]> {
    return [
      {
        bridge: "StellarX Bridge",
        sourceChain: "Stellar",
        targetChain: "Ethereum",
        p50DurationSec: 45,
        p90DurationSec: 110,
        p99DurationSec: 175,
        slaTargetSec: 180,
        compliancePercentage: 99.2,
        totalTransfers: 1420,
        breachedTransfers: 11,
      },
      {
        bridge: "Spacewalk",
        sourceChain: "Stellar",
        targetChain: "Polkadot",
        p50DurationSec: 60,
        p90DurationSec: 140,
        p99DurationSec: 210,
        slaTargetSec: 180,
        compliancePercentage: 96.5,
        totalTransfers: 850,
        breachedTransfers: 30,
      },
      {
        bridge: "Allbridge",
        sourceChain: "Solana",
        targetChain: "Stellar",
        p50DurationSec: 90,
        p90DurationSec: 220,
        p99DurationSec: 340,
        slaTargetSec: 240,
        compliancePercentage: 92.1,
        totalTransfers: 620,
        breachedTransfers: 49,
      },
    ];
  }

  public async getSLABreaches(): Promise<SLABreachIncident[]> {
    return [
      {
        id: "sla-breach-101",
        bridge: "Allbridge",
        txHash: "0x8f1e92d...4c1a",
        sourceChain: "Solana",
        targetChain: "Stellar",
        expectedDurationSec: 240,
        actualDurationSec: 485,
        status: "INVESTIGATING",
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "sla-breach-102",
        bridge: "Spacewalk",
        txHash: "0x3a4b7c...9e0f",
        sourceChain: "Stellar",
        targetChain: "Polkadot",
        expectedDurationSec: 180,
        actualDurationSec: 290,
        status: "RESOLVED",
        timestamp: new Date(Date.now() - 14400000).toISOString(),
      },
    ];
  }

  public async getConfig(): Promise<SLAConfig> {
    return slaConfig;
  }

  public async updateConfig(newConfig: Partial<SLAConfig>): Promise<SLAConfig> {
    slaConfig = { ...slaConfig, ...newConfig };
    return slaConfig;
  }
}

export const transferSLAService = new TransferSLAService();
