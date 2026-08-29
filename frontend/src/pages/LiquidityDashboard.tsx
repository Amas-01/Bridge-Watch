import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { useLiquidity } from "../hooks/useLiquidity";
import {
  LiquidityDepthChart,
  LiquidityByVenue,
  LiquidityTrend,
  PriceImpactCalculator,
  PairSelector,
} from "../components/liquidity";
import type { DepthData, TradingPair, VenueLiquidity } from "../types/liquidity";

function toCsvValue(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function buildDepthCsv(depth: DepthData): string {
  const lines = ["Side,Price,Volume,Venue"];
  for (const level of depth.bids) {
    lines.push(
      ["bid", level.price, level.volume, level.venue].map(toCsvValue).join(",")
    );
  }
  for (const level of depth.asks) {
    lines.push(
      ["ask", level.price, level.volume, level.venue].map(toCsvValue).join(",")
    );
  }
  return lines.join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function LiquidityDashboard() {
  const [pair, setPair] = useLocalStorageState<TradingPair>(
    "bridge-watch:liquidity-pair:v1",
    "USDC/XLM"
  );

  const { depth, venues, history, isLoading, error, lastUpdated } =
    useLiquidity(pair);

  const totalLiquidity = venues.reduce((s: number, v: VenueLiquidity) => s + v.totalLiquidity, 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Liquidity</h1>
          <p className="mt-1 text-stellar-text-secondary text-sm">
            Aggregated depth across SDEX, StellarX AMM, and Phoenix
          </p>
        </div>
        <PairSelector value={pair} onChange={setPair} />
      </header>

      {error && (
        <div
          role="alert"
          className="bg-red-900/30 border border-red-700 rounded-lg px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Liquidity",
            value: totalLiquidity
              ? `$${totalLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
              : "--",
          },
          {
            label: "Mid Price",
            value: depth ? depth.midPrice.toFixed(7) : "--",
          },
          {
            label: "Bid Levels",
            value: depth ? depth.bids.length.toString() : "--",
          },
          {
            label: "Ask Levels",
            value: depth ? depth.asks.length.toString() : "--",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-stellar-card border border-stellar-border rounded-lg p-4"
          >
            <p className="text-xs text-stellar-text-secondary">{stat.label}</p>
            <p className="mt-1 text-xl font-bold text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Depth chart */}
      <section
        className="bg-stellar-card border border-stellar-border rounded-lg p-6"
        aria-label={`${pair} order book depth`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Order Book Depth</h2>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-stellar-text-secondary">
                Updated {new Date(lastUpdated).toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => {
                if (!depth) return;
                const date = new Date().toISOString().slice(0, 10);
                const safePair = pair.replace("/", "-");
                downloadCsv(
                  buildDepthCsv(depth),
                  `liquidity-depth-${safePair}-${date}.csv`
                );
              }}
              disabled={!depth}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-stellar-border bg-stellar-card text-xs font-medium text-white hover:border-stellar-blue/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>
        <LiquidityDepthChart data={depth} isLoading={isLoading} pair={pair} />
      </section>

      {/* Venue breakdown + price impact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section
          className="bg-stellar-card border border-stellar-border rounded-lg p-6"
          aria-label="Liquidity by venue"
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            Liquidity by Venue
          </h2>
          <LiquidityByVenue venues={venues} isLoading={isLoading} />

          {/* Venue table */}
          {venues.length > 0 && (
            <table className="mt-4 w-full text-xs" aria-label="Venue liquidity breakdown">
              <thead>
                <tr className="text-stellar-text-secondary border-b border-stellar-border">
                  <th className="text-left pb-2">Venue</th>
                  <th className="text-right pb-2">Bid Depth</th>
                  <th className="text-right pb-2">Ask Depth</th>
                  <th className="text-right pb-2">Share</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((v: VenueLiquidity) => (
                  <tr key={v.venue} className="border-b border-stellar-border/50">
                    <td className="py-2 text-white">{v.venue}</td>
                    <td className="py-2 text-right text-stellar-text-secondary">
                      ${v.bidDepth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 text-right text-stellar-text-secondary">
                      ${v.askDepth.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="py-2 text-right text-white font-medium">
                      {v.share.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section
          className="bg-stellar-card border border-stellar-border rounded-lg p-6"
          aria-label="Price impact calculator"
        >
          <h2 className="text-lg font-semibold text-white mb-4">
            Price Impact Calculator
          </h2>
          <PriceImpactCalculator depth={depth} />
        </section>
      </div>

      {/* Trend chart */}
      <section
        className="bg-stellar-card border border-stellar-border rounded-lg p-6"
        aria-label="Liquidity trend"
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          Liquidity Trend
        </h2>
        <LiquidityTrend history={history} isLoading={isLoading} />
      </section>
    </div>
  );
}
