import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useMemo } from "react";
import { useTimeRange } from "../hooks/useTimeRange";
import { filterSeriesByTimeRange } from "../utils/timeRange";
import { getColorblindModePreference, getVisualizationTheme } from "../styles/colors";

interface LiquidityDataPoint {
  dex: string;
  bidDepth: number;
  askDepth: number;
  totalLiquidity: number;
  timestamp?: string;
}

interface LiquidityDepthChartProps {
  symbol: string;
  data: LiquidityDataPoint[];
  isLoading: boolean;
  chartId: string;
}

export default function LiquidityDepthChart({
  symbol,
  data,
  isLoading,
  chartId,
}: LiquidityDepthChartProps) {
  const { getEffectiveSelection } = useTimeRange();
  const selection = getEffectiveSelection(chartId);
  const theme = getVisualizationTheme({
    theme: "dark",
    colorblindMode: getColorblindModePreference(),
  });

  const filteredData = useMemo(() => {
    const datedEntries = data.filter((entry) => entry.timestamp);
    if (datedEntries.length === 0) {
      return data;
    }

    return filterSeriesByTimeRange(
      datedEntries,
      (entry) => entry.timestamp,
      selection
    );
  }, [data, selection]);

  if (isLoading) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          {symbol} Liquidity Depth
        </h3>
        <div className="h-64 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            Loading liquidity data...
          </span>
        </div>
      </div>
    );
  }

  if (filteredData.length === 0) {
    return (
      <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          {symbol} Liquidity Depth
        </h3>
        <div className="h-64 flex items-center justify-center">
          <span className="text-stellar-text-secondary">
            No liquidity data available in selected range
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        {symbol} Liquidity Depth by DEX
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={filteredData}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis dataKey="dex" stroke={theme.axis} tick={{ fontSize: 12 }} />
          <YAxis stroke={theme.axis} tick={{ fontSize: 12 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: theme.tooltipBg,
              border: `1px solid ${theme.grid}`,
              borderRadius: "8px",
              color: theme.tooltipText,
            }}
            formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
          />
          <Legend />
          <Bar
            dataKey="bidDepth"
            name="Bid Depth"
            fill={theme.categorical[1]}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="askDepth"
            name="Ask Depth"
            fill={theme.categorical[0]}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
