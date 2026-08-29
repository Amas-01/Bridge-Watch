import type { BridgeAnalytics } from "../../hooks/useAnalytics";

interface SnapshotCardProps {
  title: string;
  bridges: BridgeAnalytics[];
  timestamp: string;
}

function formatCurrency(v: number) {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export default function SnapshotCard({ title, bridges, timestamp }: SnapshotCardProps) {
  const totalTVL = bridges.reduce((acc, b) => acc + b.tvl, 0);
  const avgHealth = bridges.reduce((acc, b) => acc + (b.uptime30d ?? 0), 0) / bridges.length;

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-xl p-6 shadow-lg print:shadow-none print:border-gray-300">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-xl font-bold text-white print:text-black">{title}</h3>
          <p className="text-sm text-stellar-text-secondary print:text-gray-600">
            Metric Comparison Snapshot
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-stellar-text-secondary print:text-gray-600">Generated on</p>
          <p className="text-sm font-medium text-white print:text-black">{timestamp}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-stellar-dark/50 border border-stellar-border rounded-lg p-4 print:bg-white print:border-gray-200">
          <p className="text-xs text-stellar-text-secondary uppercase">Aggregate TVL</p>
          <p className="text-2xl font-bold text-stellar-blue print:text-blue-700">{formatCurrency(totalTVL)}</p>
        </div>
        <div className="bg-stellar-dark/50 border border-stellar-border rounded-lg p-4 print:bg-white print:border-gray-200">
          <p className="text-xs text-stellar-text-secondary uppercase">Avg Health Score</p>
          <p className="text-2xl font-bold text-emerald-400 print:text-emerald-700">{avgHealth.toFixed(1)}%</p>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-stellar-text-primary print:text-black underline">Bridge Highlights</h4>
        {bridges.map((b) => (
          <div key={b.name} className="flex items-center justify-between py-2 border-b border-stellar-border/50 last:border-0 print:border-gray-100">
            <span className="text-sm text-white print:text-black font-medium">{b.name}</span>
            <div className="flex gap-4">
              <span className="text-xs text-stellar-text-secondary print:text-gray-600">
                TVL: <span className="text-white print:text-black">{formatCurrency(b.tvl)}</span>
              </span>
              <span className="text-xs text-stellar-text-secondary print:text-gray-600">
                24h: <span className="text-white print:text-black">{formatCurrency(b.volume24h)}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-between items-center gap-4 no-print">
        <div className="flex-1 overflow-hidden">
          <p className="text-[10px] text-stellar-text-secondary mb-1">Shareable Link</p>
          <div className="bg-stellar-dark border border-stellar-border rounded px-2 py-1 text-[10px] text-stellar-blue truncate select-all">
            https://bridge-watch.stellar.org/snapshots/{btoa(title + timestamp).slice(0, 12)}
          </div>
        </div>
        <button 
          onClick={() => window.print()}
          className="px-4 py-2 bg-stellar-blue text-white rounded-md text-sm font-medium hover:bg-stellar-blue/90 transition-colors shrink-0"
        >
          Print PDF
        </button>
      </div>
    </div>
  );
}
