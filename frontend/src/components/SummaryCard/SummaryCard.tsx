import { useState } from "react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";

interface SummaryCardProps {
  title: string;
  value: string | number;
  trend?: {
    value: string;
    direction: "up" | "down" | "neutral";
  };
  loading?: boolean;
  href?: string;
  icon?: ReactNode;
  className?: string;
}

const TREND_COLORS: Record<string, string> = {
  up: "text-green-400",
  down: "text-red-400",
  neutral: "text-stellar-text-secondary",
};

const TREND_ICONS: Record<string, string> = {
  up: "↑",
  down: "↓",
  neutral: "→",
};

export default function SummaryCard({
  title,
  value,
  trend,
  loading = false,
  href,
  icon,
  className = "",
}: SummaryCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const content = (
    <div
      className={`bg-stellar-card border border-stellar-border rounded-lg p-5 transition-all duration-200 hover:border-stellar-blue/50 ${className} ${isHovered ? "shadow-lg" : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {loading ? (
        <div className="animate-pulse space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-stellar-border rounded" />
            <div className="h-4 w-24 bg-stellar-border rounded" />
          </div>
          <div className="h-8 w-32 bg-stellar-border rounded" />
          {trend && <div className="h-3 w-20 bg-stellar-border rounded" />}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 mb-3">
            {icon && (
              <span className="text-2xl" role="img" aria-hidden="true">
                {icon}
              </span>
            )}
            <span className="text-sm font-medium text-stellar-text-secondary uppercase tracking-wide">
              {title}
            </span>
          </div>
          <div className="text-3xl font-bold text-white">{value}</div>
          {trend && (
            <div className={`flex items-center gap-1 mt-2 text-xs ${TREND_COLORS[trend.direction]}`}>
              <span>{TREND_ICONS[trend.direction]}</span>
              <span>{trend.value}</span>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (href && !loading) {
    return (
      <Link
        to={href}
        className="block focus:outline-none focus:ring-2 focus:ring-stellar-blue rounded-lg"
        aria-label={`${title}: ${value}. Click to view details.`}
      >
        {content}
      </Link>
    );
  }

  return content;
}
