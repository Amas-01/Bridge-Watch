import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { HealthScoreHistoryRecord } from "../services/api";
import { SkeletonChart } from "./Skeleton";

interface Props {
  records: HealthScoreHistoryRecord[];
  isLoading: boolean;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * ReserveCoverageHistoryChart — LineChart showing the reserve backing score
 * over time, sourced from the health score history service.
 */
const ReserveCoverageHistoryChart = React.memo(function ReserveCoverageHistoryChart({
  records,
  isLoading,
}: Props) {
  if (isLoading) {
    return <SkeletonChart height={200} ariaLabel="Reserve coverage history loading" />;
  }

  if (records.length < 2) {
    return (
      <div className="h-40 flex items-center justify-center text-stellar-text-secondary text-sm">
        Collecting reserve coverage history…
      </div>
    );
  }

  const chartData = records.map((r) => ({
    time: formatTime(r.recordedAt),
    reserveCoverage: r.reserveBackingScore,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1E2340" />
        <XAxis
          dataKey="time"
          stroke="#8A8FA8"
          tick={{ fontSize: 10 }}
          interval="preserveStartEnd"
        />
        <YAxis
          stroke="#8A8FA8"
          tick={{ fontSize: 10 }}
          domain={[0, 100]}
          width={32}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#141829",
            border: "1px solid #1E2340",
            borderRadius: "8px",
            color: "#FFFFFF",
            fontSize: "12px",
          }}
          formatter={(v: number) => [v.toFixed(1), "Reserve Coverage Score"]}
        />
        <Line
          type="monotone"
          dataKey="reserveCoverage"
          stroke="#0057FF"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

export default ReserveCoverageHistoryChart;
