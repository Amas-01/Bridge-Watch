import React, { useState } from "react";

interface ChainExposure {
  chain: string;
  exposureUsd: number;
  sharePercentage: number;
  riskScore: number;
}

interface BridgeExposure {
  bridge: string;
  exposureUsd: number;
  sharePercentage: number;
  status: "healthy" | "warning" | "critical";
}

interface CustodianExposure {
  custodian: string;
  exposureUsd: number;
  sharePercentage: number;
}

export default function AssetExposureConcentration() {
  const [hhiScore] = useState(2150);
  const [riskLevel] = useState<"LOW" | "MEDIUM" | "HIGH" | "CRITICAL">("MEDIUM");
  const [maxChainThreshold, setMaxChainThreshold] = useState(40);
  const [maxBridgeThreshold, setMaxBridgeThreshold] = useState(35);
  const [alertSaved, setAlertSaved] = useState(false);

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

  const handleSaveAlerts = (e: React.FormEvent) => {
    e.preventDefault();
    setAlertSaved(true);
    setTimeout(() => setAlertSaved(false), 3000);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Asset Exposure Concentration Dashboard</h1>
        <p className="mt-1 text-sm text-stellar-text-secondary">
          Monitor multi-chain TVL distribution, Herfindahl-Hirschman Index (HHI) risk scores, and bridge/custodian holding concentration.
        </p>
      </div>

      {/* Top Metrics Row */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-stellar-text-secondary">Total Value Locked (TVL)</span>
          <div className="mt-2 text-3xl font-extrabold text-white">$100,000,000</div>
          <span className="mt-1 inline-block text-xs text-stellar-text-muted">Across 4 chains & 4 bridges</span>
        </div>

        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-stellar-text-secondary">Concentration Score (HHI)</span>
          <div className="mt-2 text-3xl font-extrabold text-white">{hhiScore}</div>
          <span className="mt-1 inline-block text-xs text-stellar-text-muted">Moderate Concentration (1,800 - 2,500)</span>
        </div>

        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
          <span className="text-xs font-semibold uppercase tracking-wider text-stellar-text-secondary">System Risk Level</span>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-md bg-amber-500/20 px-3 py-1 text-lg font-bold text-amber-400">
              {riskLevel} RISK
            </span>
          </div>
          <span className="mt-1 inline-block text-xs text-stellar-text-muted">Top chain holds 45% of TVL</span>
        </div>
      </div>

      {/* Exposure Breakdown Grids */}
      <div className="mb-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Chain Concentration */}
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Chain Exposure Concentration</h2>
          <div className="space-y-4">
            {chains.map((c) => (
              <div key={c.chain}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-white">{c.chain}</span>
                  <span className="text-stellar-text-secondary">${(c.exposureUsd / 1000000).toFixed(1)}M ({c.sharePercentage}%)</span>
                </div>
                <div className="h-2 w-full rounded-full bg-stellar-dark">
                  <div
                    className="h-2 rounded-full bg-stellar-blue"
                    style={{ width: `${c.sharePercentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bridge Concentration */}
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Bridge TVL Concentration</h2>
          <div className="space-y-4">
            {bridges.map((b) => (
              <div key={b.bridge}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium text-white">{b.bridge}</span>
                  <span className="text-stellar-text-secondary">${(b.exposureUsd / 1000000).toFixed(1)}M ({b.sharePercentage}%)</span>
                </div>
                <div className="h-2 w-full rounded-full bg-stellar-dark">
                  <div
                    className={`h-2 rounded-full ${
                      b.status === "warning" ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                    style={{ width: `${b.sharePercentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Custodian Table & Rebalance Alert Config */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-white">Custodian Holding Exposure</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-stellar-text-secondary">
              <thead className="border-b border-stellar-border bg-stellar-dark text-xs uppercase text-stellar-text-muted">
                <tr>
                  <th className="px-4 py-3">Custodian</th>
                  <th className="px-4 py-3">Exposure (USD)</th>
                  <th className="px-4 py-3">TVL Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border">
                {custodians.map((cust) => (
                  <tr key={cust.custodian}>
                    <td className="px-4 py-3 font-medium text-white">{cust.custodian}</td>
                    <td className="px-4 py-3">${cust.exposureUsd.toLocaleString()}</td>
                    <td className="px-4 py-3">{cust.sharePercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rebalance Alert Config */}
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-white">Rebalance Alert Rules</h2>
          <form onSubmit={handleSaveAlerts} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Max Chain Threshold (%)</label>
              <input
                type="number"
                value={maxChainThreshold}
                onChange={(e) => setMaxChainThreshold(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:border-stellar-blue focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Max Bridge Threshold (%)</label>
              <input
                type="number"
                value={maxBridgeThreshold}
                onChange={(e) => setMaxBridgeThreshold(Number(e.target.value))}
                className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:border-stellar-blue focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-md bg-stellar-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-stellar-blue/80"
            >
              Save Alert Thresholds
            </button>
            {alertSaved && (
              <p className="text-center text-xs font-medium text-emerald-400">Alert rules updated!</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
