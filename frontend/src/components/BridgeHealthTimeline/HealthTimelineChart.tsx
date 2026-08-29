import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import type { BridgeHealthPoint } from "../../services/api";
import type { HealthPeriod } from "../../hooks/useBridgeHealthTimeline";

interface Props {
  points: BridgeHealthPoint[];
  period: HealthPeriod;
  bridgeName: string;
  isMockData: boolean;
}

function formatXAxis(timestamp: string, period: HealthPeriod): string {
  const d = new Date(timestamp);
  if (period === "24h") {
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  if (period === "7d") {
    return d.toLocaleDateString("en-US", { weekday: "short" }) + " " +
      d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function scoreColor(score: number): string {
  if (score >= 80) return "#22c55e";
  if (score >= 50) return "#eab308";
  return "#ef4444";
}

const CustomTooltip = ({
  active,
  payload,
  label,
  period,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: BridgeHealthPoint }>;
  label?: string;
  period: HealthPeriod;
}) => {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  const score = payload[0]?.value ?? 0;
  return (
    <div className="bg-stellar-card border border-stellar-border rounded-lg p-3 text-xs shadow-xl min-w-[160px]">
      <p className="text-stellar-text-secondary mb-1">
        {label ? formatXAxis(label, period) : ""}
      </p>
      <p className="text-white font-semibold text-base" style={{ color: scoreColor(score) }}>
        {score}
        <span className="text-stellar-text-secondary font-normal ml-1">/ 100</span>
      </p>
      {point?.annotation && (
        <p className="mt-1 text-yellow-400 flex items-center gap-1">
          <span>&#9679;</span> {point.annotation}
        </p>
      )}
      <p className="mt-1 text-stellar-text-secondary">
        {score >= 80 ? "Healthy" : score >= 50 ? "Warning" : "Critical"}
      </p>
    </div>
  );
};

export default function HealthTimelineChart({ points, period, bridgeName, isMockData }: Props) {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-stellar-text-secondary text-sm">
        No health history available for {bridgeName}
      </div>
    );
  }

  const annotations = points.filter((p) => p.annotation);

  const tickInterval = Math.max(1, Math.floor(points.length / 6));

  return (
    <div className="relative">
      {isMockData && (
        <div className="absolute top-0 right-0 z-10 text-xs text-stellar-text-muted bg-stellar-dark/80 rounded px-2 py-1">
          Demo data
        </div>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="healthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0057FF" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#0057FF" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />

          <XAxis
            dataKey="timestamp"
            tickFormatter={(v) => formatXAxis(v, period)}
            interval={tickInterval}
            tick={{ fill: "#8A8FA8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tick={{ fill: "#8A8FA8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={32}
          />

          <Tooltip content={<CustomTooltip period={period} />} />

          <ReferenceLine y={80} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Healthy", fill: "#22c55e", fontSize: 10, position: "insideTopRight" }} />
          <ReferenceLine y={50} stroke="#eab308" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: "Warning", fill: "#eab308", fontSize: 10, position: "insideTopRight" }} />

          <Area
            type="monotone"
            dataKey="score"
            stroke="#0057FF"
            strokeWidth={2}
            fill="url(#healthGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#0057FF", stroke: "#fff", strokeWidth: 1.5 }}
          />

          {annotations.map((point, i) => (
            <ReferenceDot
              key={i}
              x={point.timestamp}
              y={point.score}
              r={5}
              fill="#f59e0b"
              stroke="#0057FF"
              strokeWidth={1.5}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
