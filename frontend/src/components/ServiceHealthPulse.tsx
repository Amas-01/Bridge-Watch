import { useState } from "react";
import { useServiceHealth, type ServiceStatus } from "../hooks/useServiceHealth";

interface ServiceHealthPulseProps {
  compact?: boolean;
  className?: string;
}

interface StatusConfig {
  label: string;
  dotColor: string;
  bgColor: string;
  textColor: string;
  pulse: boolean;
}

const STATUS_CONFIG: Record<ServiceStatus, StatusConfig> = {
  healthy: {
    label: "All systems operational",
    dotColor: "bg-green-500",
    bgColor: "bg-green-500/20",
    textColor: "text-green-400",
    pulse: true,
  },
  degraded: {
    label: "Degraded performance",
    dotColor: "bg-yellow-500",
    bgColor: "bg-yellow-500/20",
    textColor: "text-yellow-400",
    pulse: true,
  },
  down: {
    label: "Service disruption",
    dotColor: "bg-red-500",
    bgColor: "bg-red-500/20",
    textColor: "text-red-400",
    pulse: true,
  },
  maintenance: {
    label: "Scheduled maintenance",
    dotColor: "bg-blue-500",
    bgColor: "bg-blue-500/20",
    textColor: "text-blue-400",
    pulse: false,
  },
  unknown: {
    label: "Status unknown",
    dotColor: "bg-gray-500",
    bgColor: "bg-gray-500/20",
    textColor: "text-gray-400",
    pulse: false,
  },
};

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function ServiceHealthPulseSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`bg-stellar-card border border-stellar-border rounded-lg p-4 ${className || ""}`}
      role="article"
      aria-label="Loading service health data"
    >
      <div className="flex items-center gap-3">
        <div className="w-3 h-3 rounded-full bg-stellar-border animate-pulse" />
        <div className="flex-1">
          <div className="h-4 w-32 bg-stellar-border rounded animate-pulse" />
          <div className="h-3 w-24 bg-stellar-border rounded animate-pulse mt-1" />
        </div>
      </div>
    </div>
  );
}

export default function ServiceHealthPulse({
  compact = true,
  className = "",
}: ServiceHealthPulseProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const { data, isLoading, isError, error } = useServiceHealth();

  if (isLoading) {
    return <ServiceHealthPulseSkeleton className={className} />;
  }

  if (isError || !data) {
    return (
      <div
        className={`bg-stellar-card border border-stellar-border rounded-lg p-4 ${className}`}
        role="alert"
      >
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-medium text-stellar-text-primary">
              Unable to load service health
            </p>
            <p className="text-xs text-stellar-text-secondary mt-0.5">
              {error instanceof Error ? error.message : "Please try again later"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const config = STATUS_CONFIG[data.overallStatus];
  const relativeTime = formatRelativeTime(data.lastUpdated);

  return (
    <div
      className={`bg-stellar-card border border-stellar-border rounded-lg p-4 hover:border-stellar-blue transition-colors ${className}`}
      role="article"
      aria-label={`Service health: ${config.label}`}
    >
      {/* Compact view - always visible */}
      <div className="flex items-start gap-3">
        {/* Pulse indicator */}
        <span
          className="relative flex h-3 w-3 mt-0.5"
          role="status"
          aria-live="polite"
          aria-label={`Overall status: ${config.label}`}
        >
          {config.pulse && (
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dotColor} opacity-75`}
              aria-hidden="true"
            />
          )}
          <span
            className={`relative inline-flex h-3 w-3 rounded-full ${config.dotColor}`}
            aria-hidden="true"
          />
        </span>

        {/* Status info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-stellar-text-primary truncate">
              {config.label}
            </p>
            {data.totalServices > 0 && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
                aria-controls="service-health-details"
                className="flex items-center justify-center w-5 h-5 rounded hover:bg-stellar-border focus:outline-none focus:ring-2 focus:ring-stellar-blue transition-colors"
                aria-label={isExpanded ? "Collapse service details" : "Expand service details"}
              >
                <svg
                  className={`w-3 h-3 text-stellar-text-secondary transition-transform duration-200 ${
                    isExpanded ? "rotate-180" : "rotate-0"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 text-xs text-stellar-text-secondary">
            <span>{data.totalServices} service{data.totalServices !== 1 ? "s" : ""}</span>
            <span aria-hidden="true">•</span>
            <span>Updated {relativeTime}</span>
            <span aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Horizon Stream Node: Active
            </span>
          </div>
        </div>
      </div>

      {/* Detailed view - expandable */}
      {data.totalServices > 0 && (
        <div
          id="service-health-details"
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
            isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <div className="pt-3 mt-3 border-t border-stellar-border">
              <ul className="space-y-2" role="list" aria-label="Service status breakdown">
                {data.services.map((service) => {
                  const serviceConfig = STATUS_CONFIG[service.status];
                  return (
                    <li
                      key={service.name}
                      className="flex items-center gap-2.5"
                      role="listitem"
                    >
                      <span
                        className={`flex-shrink-0 w-2 h-2 rounded-full ${serviceConfig.dotColor}`}
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-sm text-stellar-text-primary truncate">
                        {service.name}
                      </span>
                      <span
                        className={`flex-shrink-0 text-xs ${serviceConfig.textColor} capitalize`}
                        aria-label={`Status: ${service.status}`}
                      >
                        {service.status}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export { ServiceHealthPulseSkeleton };
