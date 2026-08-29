import { memo, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import SparklineTooltip from "./SparklineTooltip";
import {
  useSparklineData,
  type SparklineMetric,
  type SparklinePeriod,
  type SparklinePoint,
} from "../hooks/useSparklineData";

type TrendDirection = "up" | "down" | "flat";

const SPARKLINE_SKELETON_HEIGHT = 32;

function stellarVarRgb(varName: string, fallbackRgb: string): string {
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    if (!raw) return fallbackRgb;
    return `rgb(${raw})`;
  } catch {
    return fallbackRgb;
  }
}

function getTrendDirection(points: SparklinePoint[]): TrendDirection {
  if (points.length < 2) return "flat";
  const first = points[0]?.value;
  const last = points[points.length - 1]?.value;
  if (first === undefined || last === undefined) return "flat";
  if (last > first) return "up";
  if (last < first) return "down";
  return "flat";
}

function defaultFormatter(metric: SparklineMetric) {
  if (metric === "health") {
    return (value: number) => `${Math.round(value)}`;
  }
  if (metric === "price") {
    return (value: number) => `$${value.toLocaleString()}`;
  }
  return (value: number) => value.toLocaleString();
}

function useInViewport<T extends Element>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (inView) return;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting) {
        setInView(true);
        observer.disconnect();
      }
    }, options);

    observer.observe(node);
    return () => observer.disconnect();
  }, [inView, options]);

  return { ref, inView };
}

export interface SparklineProps {
  data?: SparklinePoint[];

  symbol?: string;
  metric?: SparklineMetric;
  period?: SparklinePeriod;
  lazy?: boolean;

  width?: number | string;
  height?: number;

  strokeWidth?: number;
  showMinMax?: boolean;

  formatter?: (value: number) => string;

  "aria-label"?: string;
}

function SparklineImpl({
  data,
  symbol,
  metric = "health",
  period = "7d",
  lazy = true,
  width = "100%",
  height = 36,
  strokeWidth = 2,
  showMinMax = true,
  formatter,
  "aria-label": ariaLabel,
}: SparklineProps) {
  const gradientId = useId();
  const { ref, inView } = useInViewport<HTMLDivElement>({
    rootMargin: "200px",
    threshold: 0.01,
  });

  const queryEnabled = !!symbol && (!lazy || inView);
  const { data: fetched, isLoading } = useSparklineData({
    symbol: symbol ?? "",
    metric,
    period,
    enabled: queryEnabled,
  });

  const points = data ?? fetched ?? [];

  const minMax = useMemo(() => {
    if (points.length === 0) return null;
    let min = points[0];
    let max = points[0];
    for (const p of points) {
      if (p.value < min.value) min = p;
      if (p.value > max.value) max = p;
    }
    return { min, max };
  }, [points]);

  const trend = useMemo(() => getTrendDirection(points), [points]);

  const colors = useMemo(() => {
    if (trend === "up") {
      return { stroke: "#22c55e", fade: "rgba(34, 197, 94, 0)" };
    }
    if (trend === "down") {
      return { stroke: "#ef4444", fade: "rgba(239, 68, 68, 0)" };
    }
    return { stroke: "#8A8FA8", fade: "rgba(138, 143, 168, 0)" };
  }, [trend]);

  const valueFormatter = formatter ?? defaultFormatter(metric);

  const emptyState = !isLoading && points.length === 0;

  return (
    <div ref={ref} style={{ width }} aria-label={ariaLabel}>
      <div style={{ height }} className="flex items-center">
        {isLoading ? (
          <div
            className="skeleton w-full rounded bg-stellar-border/40"
            style={{ height: SPARKLINE_SKELETON_HEIGHT }}
            role="status"
            aria-busy="true"
            aria-label="Loading sparkline"
          />
        ) : emptyState ? (
          <div
            className="w-full h-full bg-stellar-border/30 rounded"
            aria-hidden="true"
          />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 2, bottom: 2, left: 2, right: 2 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={colors.fade} />
                  <stop offset="35%" stopColor={colors.stroke} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={colors.stroke} />
                </linearGradient>
              </defs>

              <Tooltip
                useTranslate3d
                isAnimationActive={false}
                wrapperStyle={{ outline: "none", pointerEvents: "none" }}
                allowEscapeViewBox={{ x: true, y: true }}
                content={
                  <SparklineTooltip
                    formatter={valueFormatter}
                    header={
                      <span className="tabular-nums">
                        {metric.toUpperCase()} · {period}
                      </span>
                    }
                  />
                }
                cursor={false}
              />

              <Line
                type="monotone"
                dataKey="value"
                stroke={`url(#${gradientId})`}
                strokeWidth={strokeWidth}
                dot={false}
                isAnimationActive
                animationDuration={450}
                activeDot={{ r: 5 }}
              />

              {showMinMax && minMax ? (
                <>
                  <ReferenceDot
                    x={minMax.min.timestamp}
                    y={minMax.min.value}
                    r={3}
                    fill={colors.stroke}
                    stroke={stellarVarRgb("--stellar-card", "rgb(20 24 41)")}
                    strokeWidth={1}
                    ifOverflow="extendDomain"
                  />
                  <ReferenceDot
                    x={minMax.max.timestamp}
                    y={minMax.max.value}
                    r={3}
                    fill={colors.stroke}
                    stroke={stellarVarRgb("--stellar-card", "rgb(20 24 41)")}
                    strokeWidth={1}
                    ifOverflow="extendDomain"
                  />
                </>
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

const Sparkline = memo(SparklineImpl);
export default Sparkline;
