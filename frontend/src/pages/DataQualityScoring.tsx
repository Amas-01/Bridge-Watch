import React, { useState } from "react";

interface DimensionScore {
  name: "Freshness" | "Completeness" | "Accuracy" | "Consistency" | "Uniqueness";
  score: number;
  weight: number;
  status: "EXCELLENT" | "GOOD" | "WARN" | "POOR";
}

interface DataSourceQuality {
  sourceId: string;
  sourceName: string;
  overallScore: number;
  dimensions: DimensionScore[];
}

export default function DataQualityScoring() {
  const [freshnessWeight, setFreshnessWeight] = useState(30);
  const [completenessWeight, setCompletenessWeight] = useState(25);
  const [accuracyWeight, setAccuracyWeight] = useState(25);
  const [consistencyWeight, setConsistencyWeight] = useState(10);
  const [uniquenessWeight, setUniquenessWeight] = useState(10);
  const [saved, setSaved] = useState(false);

  const sources: DataSourceQuality[] = [
    {
      sourceId: "src-stellar-horizon",
      sourceName: "Stellar Horizon API",
      overallScore: 96,
      dimensions: [
        { name: "Freshness", score: 98, weight: 0.3, status: "EXCELLENT" },
        { name: "Completeness", score: 95, weight: 0.25, status: "EXCELLENT" },
        { name: "Accuracy", score: 96, weight: 0.25, status: "EXCELLENT" },
        { name: "Consistency", score: 94, weight: 0.1, status: "GOOD" },
        { name: "Uniqueness", score: 97, weight: 0.1, status: "EXCELLENT" },
      ],
    },
    {
      sourceId: "src-ethereum-rpc",
      sourceName: "Ethereum Alchemy RPC",
      overallScore: 89,
      dimensions: [
        { name: "Freshness", score: 90, weight: 0.3, status: "GOOD" },
        { name: "Completeness", score: 88, weight: 0.25, status: "GOOD" },
        { name: "Accuracy", score: 92, weight: 0.25, status: "EXCELLENT" },
        { name: "Consistency", score: 84, weight: 0.1, status: "WARN" },
        { name: "Uniqueness", score: 93, weight: 0.1, status: "GOOD" },
      ],
    },
    {
      sourceId: "src-coingecko-oracle",
      sourceName: "CoinGecko Price Oracle",
      overallScore: 78,
      dimensions: [
        { name: "Freshness", score: 72, weight: 0.3, status: "WARN" },
        { name: "Completeness", score: 80, weight: 0.25, status: "GOOD" },
        { name: "Accuracy", score: 82, weight: 0.25, status: "GOOD" },
        { name: "Consistency", score: 75, weight: 0.1, status: "WARN" },
        { name: "Uniqueness", score: 85, weight: 0.1, status: "GOOD" },
      ],
    },
  ];

  const handleSaveWeights = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configurable Data Quality Scoring (DQS)</h1>
        <p className="mt-1 text-sm text-stellar-text-secondary">
          Evaluate and configure data quality scores across monitored indexing nodes, RPCs, and oracle feeds based on 5 dimensions.
        </p>
      </div>

      {/* Datasource Quality Grid */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        {sources.map((s) => (
          <div key={s.sourceId} className="rounded-lg border border-stellar-border bg-stellar-card p-6">
            <h2 className="font-semibold text-white">{s.sourceName}</h2>

            <div className="mt-4 flex items-baseline justify-between">
              <span className="text-3xl font-extrabold text-emerald-400">{s.overallScore} / 100</span>
              <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">PASSED</span>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              {s.dimensions.map((d) => (
                <div key={d.name} className="flex justify-between border-b border-stellar-border/50 py-1">
                  <span className="text-stellar-text-secondary">{d.name}</span>
                  <span className={`font-semibold ${
                    d.status === "EXCELLENT" ? "text-emerald-400" : d.status === "GOOD" ? "text-blue-400" : "text-amber-400"
                  }`}>{d.score}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Weighting Slider Controls Form */}
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">Configure Dimension Weightings (%)</h2>
        <form onSubmit={handleSaveWeights} className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="block text-xs font-medium text-stellar-text-secondary">Freshness ({freshnessWeight}%)</label>
            <input
              type="range"
              min="0"
              max="50"
              value={freshnessWeight}
              onChange={(e) => setFreshnessWeight(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stellar-text-secondary">Completeness ({completenessWeight}%)</label>
            <input
              type="range"
              min="0"
              max="50"
              value={completenessWeight}
              onChange={(e) => setCompletenessWeight(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stellar-text-secondary">Accuracy ({accuracyWeight}%)</label>
            <input
              type="range"
              min="0"
              max="50"
              value={accuracyWeight}
              onChange={(e) => setAccuracyWeight(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stellar-text-secondary">Consistency ({consistencyWeight}%)</label>
            <input
              type="range"
              min="0"
              max="50"
              value={consistencyWeight}
              onChange={(e) => setConsistencyWeight(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stellar-text-secondary">Uniqueness ({uniquenessWeight}%)</label>
            <input
              type="range"
              min="0"
              max="50"
              value={uniquenessWeight}
              onChange={(e) => setUniquenessWeight(Number(e.target.value))}
              className="mt-2 w-full"
            />
          </div>

          <div className="lg:col-span-5">
            <button
              type="submit"
              className="rounded-md bg-stellar-blue px-6 py-2 text-sm font-semibold text-white transition hover:bg-stellar-blue/80"
            >
              Save Quality Weights
            </button>
            {saved && (
              <span className="ml-4 text-xs font-medium text-emerald-400">Quality dimension weights updated!</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
