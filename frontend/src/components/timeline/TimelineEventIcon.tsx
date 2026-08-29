/**
 * Icon component for timeline events
 */

import type { TimelineEventType, TimelineEventSeverity } from "../../types/timeline";

interface TimelineEventIconProps {
  type: TimelineEventType;
  severity?: TimelineEventSeverity;
  className?: string;
}

const SEVERITY_COLORS: Record<TimelineEventSeverity, string> = {
  info: "text-blue-400",
  warning: "text-yellow-400",
  critical: "text-red-400",
};

export default function TimelineEventIcon({
  type,
  severity = "info",
  className = "",
}: TimelineEventIconProps) {
  const colorClass = SEVERITY_COLORS[severity];
  const baseClass = `w-5 h-5 ${colorClass} ${className}`;

  switch (type) {
    case "bridge":
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Bridge event">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      );

    case "asset":
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Asset event">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );

    case "alert":
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Alert event">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      );

    case "transaction":
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Transaction event">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
          />
        </svg>
      );

    case "health":
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Health event">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      );

    default:
      return (
        <svg className={baseClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label="Event">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      );
  }
}
