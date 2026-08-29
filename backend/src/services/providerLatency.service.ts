export interface ProviderLatencyMetrics {
  providerId: string;
  providerName: string;
  region: string;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  errorRatePct: number;
  status: "ONLINE" | "DEGRADED" | "OFFLINE";
  lastProbeTime: string;
}

export interface LatencyTimePoint {
  timestamp: string;
  infuraMs: number;
  alchemyMs: number;
  quickNodeMs: number;
  ankrMs: number;
}

export interface BenchmarkResult {
  benchmarkId: string;
  executedAt: string;
  totalProbesSent: number;
  fastestProvider: string;
  slowestProvider: string;
  results: ProviderLatencyMetrics[];
}

export class ProviderLatencyService {
  public async getComparison(): Promise<ProviderLatencyMetrics[]> {
    return [
      {
        providerId: "prov-infura",
        providerName: "Infura Ethereum Mainnet",
        region: "us-east-1",
        avgLatencyMs: 42,
        p95LatencyMs: 88,
        p99LatencyMs: 145,
        errorRatePct: 0.02,
        status: "ONLINE",
        lastProbeTime: new Date().toISOString(),
      },
      {
        providerId: "prov-alchemy",
        providerName: "Alchemy RPC Node",
        region: "us-east-1",
        avgLatencyMs: 35,
        p95LatencyMs: 72,
        p99LatencyMs: 120,
        errorRatePct: 0.01,
        status: "ONLINE",
        lastProbeTime: new Date().toISOString(),
      },
      {
        providerId: "prov-quicknode",
        providerName: "QuickNode Stellar RPC",
        region: "eu-west-1",
        avgLatencyMs: 58,
        p95LatencyMs: 110,
        p99LatencyMs: 195,
        errorRatePct: 0.15,
        status: "ONLINE",
        lastProbeTime: new Date().toISOString(),
      },
      {
        providerId: "prov-ankr",
        providerName: "Ankr Public Node",
        region: "us-west-2",
        avgLatencyMs: 115,
        p95LatencyMs: 240,
        p99LatencyMs: 410,
        errorRatePct: 1.20,
        status: "DEGRADED",
        lastProbeTime: new Date().toISOString(),
      },
    ];
  }

  public async getHistorical(): Promise<LatencyTimePoint[]> {
    const points: LatencyTimePoint[] = [];
    const now = Date.now();
    for (let i = 12; i >= 0; i--) {
      const time = new Date(now - i * 300000).toISOString();
      points.push({
        timestamp: time,
        infuraMs: 40 + Math.floor(Math.random() * 15),
        alchemyMs: 32 + Math.floor(Math.random() * 12),
        quickNodeMs: 55 + Math.floor(Math.random() * 20),
        ankrMs: 100 + Math.floor(Math.random() * 40),
      });
    }
    return points;
  }

  public async triggerBenchmark(): Promise<BenchmarkResult> {
    const comparison = await this.getComparison();
    return {
      benchmarkId: `bm-${Date.now()}`,
      executedAt: new Date().toISOString(),
      totalProbesSent: 100,
      fastestProvider: "Alchemy RPC Node",
      slowestProvider: "Ankr Public Node",
      results: comparison,
    };
  }
}

export const providerLatencyService = new ProviderLatencyService();
