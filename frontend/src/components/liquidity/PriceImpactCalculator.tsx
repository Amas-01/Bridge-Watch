import { useState, useMemo } from "react";
import type { DepthData, PriceImpactResult } from "../../types/liquidity";

interface Props {
  depth: DepthData | null;
}

/**
 * Walk the ask side of the order book to calculate expected fill price
 * and slippage for a given trade size (in quote asset units).
 */
function calcPriceImpact(depth: DepthData, tradeSize: number): PriceImpactResult {
  if (!depth.asks.length || tradeSize <= 0) {
    return { tradeSize, expectedPrice: depth.midPrice, slippagePct: 0, fillableLiquidity: 0 };
  }

  let remaining = tradeSize;
  let totalCost = 0;
  let prevVolume = 0;

  for (const level of depth.asks) {
    const levelVolume = level.volume - prevVolume;
    const fillable = Math.min(remaining, levelVolume);
    totalCost += fillable * level.price;
    remaining -= fillable;
    prevVolume = level.volume;
    if (remaining <= 0) break;
  }

  const filled = tradeSize - remaining;
  const expectedPrice = filled > 0 ? totalCost / filled : depth.midPrice;
  const slippagePct = ((expectedPrice - depth.midPrice) / depth.midPrice) * 100;

  return {
    tradeSize,
    expectedPrice: parseFloat(expectedPrice.toFixed(7)),
    slippagePct: parseFloat(slippagePct.toFixed(4)),
    fillableLiquidity: parseFloat(filled.toFixed(7)),
  };
}

export default function PriceImpactCalculator({ depth }: Props) {
  const [tradeSize, setTradeSize] = useState<string>("");
  const [showExplanation, setShowExplanation] = useState(false);

  const result = useMemo<PriceImpactResult | null>(() => {
    const size = parseFloat(tradeSize);
    if (!depth || isNaN(size) || size <= 0) return null;
    return calcPriceImpact(depth, size);
  }, [depth, tradeSize]);

  const slippageColor =
    !result ? "text-white"
      : result.slippagePct < 0.1 ? "text-green-400"
        : result.slippagePct < 0.5 ? "text-yellow-400"
          : "text-red-400";

  const exportData = () => {
    if (!result) return;
    const csvContent =
      "Trade Size,Expected Price,Slippage %,Fillable Liquidity\n" +
      `${result.tradeSize},${result.expectedPrice},${result.slippagePct},${result.fillableLiquidity}`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `price_impact_${depth?.pair.replace("/", "_")}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="trade-size"
          className="block text-xs text-stellar-text-secondary mb-1"
        >
          Trade size (quote asset units)
        </label>
        <div className="relative">
          <input
            id="trade-size"
            type="number"
            min="0"
            step="any"
            placeholder="e.g. 10000"
            value={tradeSize}
            onChange={(e) => setTradeSize(e.target.value)}
            className="w-full bg-stellar-dark border border-stellar-border rounded-md px-3 py-2 text-sm text-white placeholder-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          />
          {depth && (
            <div className="absolute right-3 top-2 text-xs text-stellar-text-secondary">
              {depth.pair.split("/")[1]}
            </div>
          )}
        </div>
      </div>

      {result && (
        <>
          <dl className="space-y-3 text-sm bg-stellar-dark/50 p-4 rounded-lg border border-stellar-border/50">
            <div className="flex justify-between">
              <dt className="text-stellar-text-secondary">Expected Price</dt>
              <dd className="text-white font-mono">{result.expectedPrice.toFixed(7)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-stellar-text-secondary">Price Impact / Slippage</dt>
              <dd className={`font-mono font-semibold text-lg ${slippageColor}`}>
                {result.slippagePct >= 0 ? "+" : ""}
                {result.slippagePct.toFixed(4)}%
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stellar-text-secondary">Fillable Liquidity</dt>
              <dd className="text-white font-mono">
                {result.fillableLiquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </dd>
            </div>

            {result.slippagePct > 1 && (
              <div className="mt-2 p-2 bg-red-900/20 border border-red-700/50 rounded text-red-400 text-xs">
                ⚠️ High price impact. Consider splitting your trade into smaller chunks or choosing a more liquid pair.
              </div>
            )}
          </dl>

          <div className="flex gap-2">
            <button
              onClick={() => setShowExplanation(!showExplanation)}
              className="flex-1 text-xs text-stellar-blue hover:text-stellar-blue-light transition-colors text-left"
            >
              {showExplanation ? "Hide Explanation" : "How is this calculated?"}
            </button>
            <button
              onClick={exportData}
              className="px-3 py-1 bg-stellar-border hover:bg-stellar-border-heavy text-white text-xs rounded transition-colors"
            >
              Export CSV
            </button>
          </div>

          {showExplanation && (
            <div className="text-xs text-stellar-text-secondary leading-relaxed bg-stellar-dark/30 p-3 rounded border border-stellar-border/30">
              <p className="mb-2">
                This calculator simulates a market buy order by "walking the order book."
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>We fetch the aggregated real-time order book for <strong>{depth?.pair}</strong>.</li>
                <li>We fill your requested size starting from the best available price (Mid Price).</li>
                <li>As you buy more, you deeper into the "asks", leading to a higher average fill price.</li>
                <li>The <strong>Slippage</strong> reflects the difference between the Mid Price and your estimated average fill price.</li>
              </ol>
            </div>
          )}
        </>
      )}

      {!depth && (
        <p className="text-xs text-stellar-text-secondary animate-pulse">
          Connecting to liquidity aggregator...
        </p>
      )}
    </div>
  );
}
