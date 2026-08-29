export interface DimensionScore {
  name: "Freshness" | "Completeness" | "Accuracy" | "Consistency" | "Uniqueness";
  score: number; // 0 - 100
  weight: number; // 0 - 1.0
  status: "EXCELLENT" | "GOOD" | "WARN" | "POOR";
}

export interface DataSourceQuality {
  sourceId: string;
  sourceName: string;
  overallScore: number;
  dimensions: DimensionScore[];
  lastEvaluatedAt: string;
}

export interface QualityRuleConfig {
  freshnessWeight: number;
  completenessWeight: number;
  accuracyWeight: number;
  consistencyWeight: number;
  uniquenessWeight: number;
  minimumAcceptableScore: number;
}

let qualityRuleConfig: QualityRuleConfig = {
  freshnessWeight: 0.30,
  completenessWeight: 0.25,
  accuracyWeight: 0.25,
  consistencyWeight: 0.10,
  uniquenessWeight: 0.10,
  minimumAcceptableScore: 80,
};

export class DataQualityService {
  public async getQualityScores(): Promise<DataSourceQuality[]> {
    return [
      {
        sourceId: "src-stellar-horizon",
        sourceName: "Stellar Horizon API",
        overallScore: 96,
        dimensions: [
          { name: "Freshness", score: 98, weight: qualityRuleConfig.freshnessWeight, status: "EXCELLENT" },
          { name: "Completeness", score: 95, weight: qualityRuleConfig.completenessWeight, status: "EXCELLENT" },
          { name: "Accuracy", score: 96, weight: qualityRuleConfig.accuracyWeight, status: "EXCELLENT" },
          { name: "Consistency", score: 94, weight: qualityRuleConfig.consistencyWeight, status: "GOOD" },
          { name: "Uniqueness", score: 97, weight: qualityRuleConfig.uniquenessWeight, status: "EXCELLENT" },
        ],
        lastEvaluatedAt: new Date().toISOString(),
      },
      {
        sourceId: "src-ethereum-rpc",
        sourceName: "Ethereum Alchemy RPC",
        overallScore: 89,
        dimensions: [
          { name: "Freshness", score: 90, weight: qualityRuleConfig.freshnessWeight, status: "GOOD" },
          { name: "Completeness", score: 88, weight: qualityRuleConfig.completenessWeight, status: "GOOD" },
          { name: "Accuracy", score: 92, weight: qualityRuleConfig.accuracyWeight, status: "EXCELLENT" },
          { name: "Consistency", score: 84, weight: qualityRuleConfig.consistencyWeight, status: "WARN" },
          { name: "Uniqueness", score: 93, weight: qualityRuleConfig.uniquenessWeight, status: "GOOD" },
        ],
        lastEvaluatedAt: new Date().toISOString(),
      },
      {
        sourceId: "src-coingecko-oracle",
        sourceName: "CoinGecko Price Oracle",
        overallScore: 78,
        dimensions: [
          { name: "Freshness", score: 72, weight: qualityRuleConfig.freshnessWeight, status: "WARN" },
          { name: "Completeness", score: 80, weight: qualityRuleConfig.completenessWeight, status: "GOOD" },
          { name: "Accuracy", score: 82, weight: qualityRuleConfig.accuracyWeight, status: "GOOD" },
          { name: "Consistency", score: 75, weight: qualityRuleConfig.consistencyWeight, status: "WARN" },
          { name: "Uniqueness", score: 85, weight: qualityRuleConfig.uniquenessWeight, status: "GOOD" },
        ],
        lastEvaluatedAt: new Date().toISOString(),
      },
    ];
  }

  public async getQualityRules(): Promise<QualityRuleConfig> {
    return qualityRuleConfig;
  }

  public async updateQualityRules(newRules: Partial<QualityRuleConfig>): Promise<QualityRuleConfig> {
    qualityRuleConfig = { ...qualityRuleConfig, ...newRules };
    return qualityRuleConfig;
  }
}

export const dataQualityService = new DataQualityService();
