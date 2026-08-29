import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useMarketDepth, type OrderBookLevel } from "../hooks/useMarketDepth";

interface DepthPoint {
  price: number;
  bidVolume: number | null;
  askVolume: number | null;
}

function buildDepthCurve(bids: OrderBookLevel[], asks: OrderBookLevel[]): DepthPoint[] {
  // Sort bids descending, asks ascending
  const sortedBids = [...bids].sort((a, b) => b.price - a.price);
  const sortedAsks = [...asks].sort((a, b) => a.price - b.price);

  // Cumulative bid side (right to left from mid)
  let bidCumulative = 0;
  const bidPoints: DepthPoint[] = sortedBids.map((level) => {
    bidCumulative += level.amount;
    return { price: level.price, bidVolume: bidCumulative, askVolume: null };
  });

  // Cumulative ask side (left to right from mid)
  let askCumulative = 0;
  const askPoints: DepthPoint[] = sortedAsks.map((level) => {
    askCumulative += level.amount;
    return { price: level.price, bidVolume: null, askVolume: askCumulative };
  });

  return [...bidPoints.reverse(), ...askPoints];
}

interface TooltipPayloadItem {
  dataKey: string;
  value: number;
  color: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
}

function DepthTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;

  const item = payload[0];
  const isBid = item?.dataKey === "bidVolume";

  return (
    <div
      className="bg-stellar-card border border-stellar-border rounded px-3 py-2 text-xs shadow-lg"
      role="tooltip"
    >
      <p className="text-stellar-text-muted mb-1">
        Price: <span className="text-white font-medium">${Number(label).toLocaleString()}</span>
      </p>
      {item && (
        <p className={isBid ? "text-green-400" : "text-red-400"}>
          {isBid ? "Bid depth" : "Ask depth"}:{" "}
          <span className="font-medium">{Number(item.value).toLocaleString()}</span>
        </p>
      )}
    </div>
  );
}

interface AssetOption {
  label: string;
  value: string;
}

interface MarketDepthMiniChartProps {
  /** Pre-selected asset symbol. Ignored when `showAssetSelector` is true. */
  asset?: string;
  /** Show the asset dropdown for standalone widget use. Default false. */
  showAssetSelector?: boolean;
  availableAssets?: AssetOption[];
  /** Live refresh interval in milliseconds. Default 10 000. */
  refreshIntervalMs?: number;
  className?: string;
}

const DEFAULT_ASSETS: AssetOption[] = [
  { label: "USDC", value: "USDC" },
  { label: "EURC", value: "EURC" },
];

export default function MarketDepthMiniChart({
  asset: propAsset,
  showAssetSelector = false,
  availableAssets = DEFAULT_ASSETS,
  refreshIntervalMs = 10_000,
  className = "",
}: MarketDepthMiniChartProps) {
  const [selectedAsset, setSelectedAsset] = useState(
    propAsset ?? availableAssets[0]?.value ?? "USDC"
  );
  const activeAsset = showAssetSelector ? selectedAsset : (propAsset ?? selectedAsset);

  const { data, isLoading, error } = useMarketDepth(activeAsset, refreshIntervalMs);

  const depthPoints = useMemo(
    () => (data ? buildDepthCurve(data.bids, data.asks) : []),
    [data]
  );

  return (
    <div className={`bg-stellar-card border border-stellar-border rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-white">Market Depth</h3>
          {data && (
            <span className="text-xs text-stellar-text-muted">
              Spread:{" "}
              <span className="text-yellow-400 font-medium">
                ${data.spread.toFixed(4)}{" "}
                <span className="text-stellar-text-muted">({data.spreadPct.toFixed(3)}%)</span>
              </span>
            </span>
          )}
        </div>

        {showAssetSelector && (
          <select
            value={selectedAsset}
            onChange={(e) => setSelectedAsset(e.target.value)}
            className="bg-stellar-card border border-stellar-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-stellar-blue"
            aria-label="Select asset for market depth chart"
          >
            {availableAssets.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Mid-price badge */}
      {data && data.midPrice > 0 && (
        <div className="flex justify-center mb-2">
          <span className="text-xs bg-stellar-border/50 rounded px-2 py-0.5 text-stellar-text-secondary">
            Mid: <span className="text-white font-medium">${data.midPrice.toLocaleString()}</span>
          </span>
        </div>
      )}

      {/* Chart */}
      <div className="h-32" role="img" aria-label={`Market depth chart for ${activeAsset}`}>
        {isLoading && (
          <div className="h-full flex items-center justify-center">
            <span className="text-stellar-text-muted text-xs animate-pulse">Loading depth…</span>
          </div>
        )}

        {error && (
          <div className="h-full flex items-center justify-center text-red-400 text-xs">
            Unable to load depth data
          </div>
        )}

        {!isLoading && !error && depthPoints.length === 0 && (
          <div className="h-full flex items-center justify-center text-stellar-text-muted text-xs">
            No order book data available
          </div>
        )}

        {!isLoading && !error && depthPoints.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={depthPoints} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="bidGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="askGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="price"
                hide
                domain={["dataMin", "dataMax"]}
                type="number"
              />
              <YAxis hide />
              <Tooltip content={<DepthTooltip />} />
              <Area
                type="stepAfter"
                dataKey="bidVolume"
                stroke="#22c55e"
                strokeWidth={1.5}
                fill="url(#bidGrad)"
                connectNulls={false}
                isAnimationActive={false}
                name="Bid Depth"
              />
              <Area
                type="stepBefore"
                dataKey="askVolume"
                stroke="#ef4444"
                strokeWidth={1.5}
                fill="url(#askGrad)"
                connectNulls={false}
                isAnimationActive={false}
                name="Ask Depth"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-2">
        <span className="flex items-center gap-1 text-xs text-green-400">
          <span className="inline-block w-3 h-0.5 bg-green-500 rounded" />
          Bids
        </span>
        <span className="flex items-center gap-1 text-xs text-red-400">
          <span className="inline-block w-3 h-0.5 bg-red-500 rounded" />
          Asks
        </span>
      </div>
    </div>
  );
}
