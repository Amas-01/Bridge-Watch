/**
 * Timeline event card component with compact and expanded modes
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import TimelineEventIcon from "./TimelineEventIcon";
import type { TimelineEvent, TimelineDisplayMode } from "../../types/timeline";

interface TimelineEventCardProps {
  event: TimelineEvent;
  mode?: TimelineDisplayMode;
  onRemove?: (eventId: string) => void;
}

const SEVERITY_STYLES = {
  info: {
    badge: "bg-blue-900/50 text-blue-400 border border-blue-700",
    dot: "bg-blue-500",
  },
  warning: {
    badge: "bg-yellow-900/50 text-yellow-400 border border-yellow-700",
    dot: "bg-yellow-500",
  },
  critical: {
    badge: "bg-red-900/50 text-red-400 border border-red-700",
    dot: "bg-red-500",
  },
};

const STATUS_STYLES = {
  active: "text-green-400",
  resolved: "text-gray-400",
  pending: "text-yellow-400",
  completed: "text-green-400",
  failed: "text-red-400",
};

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getEventLink(event: TimelineEvent): string | null {
  switch (event.type) {
    case "asset":
    case "health":
      return `/assets/${event.assetSymbol}`;
    case "bridge":
      return `/bridges`;
    case "transaction":
      return `/transactions`;
    case "alert":
      return `/alerts`;
    default:
      return null;
  }
}

function renderEventDetails(event: TimelineEvent, isExpanded: boolean) {
  if (!isExpanded) return null;

  switch (event.type) {
    case "bridge":
      return (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Bridge:</span>
            <span className="text-stellar-text-secondary font-medium">{event.bridgeName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Status:</span>
            <span className={`font-medium capitalize ${STATUS_STYLES[event.status || "active"]}`}>
              {event.bridgeStatus}
            </span>
          </div>
          {event.totalValueLocked !== undefined && (
            <div className="flex justify-between">
              <span className="text-stellar-text-muted">TVL:</span>
              <span className="text-stellar-text-secondary font-medium">
                ${event.totalValueLocked.toLocaleString()}
              </span>
            </div>
          )}
          {event.mismatchPercentage !== undefined && event.mismatchPercentage > 0 && (
            <div className="flex justify-between">
              <span className="text-stellar-text-muted">Mismatch:</span>
              <span className="text-red-400 font-medium">{event.mismatchPercentage.toFixed(2)}%</span>
            </div>
          )}
        </div>
      );

    case "asset":
      return (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Asset:</span>
            <span className="text-stellar-text-secondary font-medium">
              {event.assetSymbol} {event.assetName && `(${event.assetName})`}
            </span>
          </div>
          {event.healthScore !== undefined && (
            <div className="flex justify-between">
              <span className="text-stellar-text-muted">Health Score:</span>
              <span className="text-stellar-text-secondary font-medium">
                {event.healthScore.toFixed(2)}
              </span>
            </div>
          )}
          {event.priceChange !== undefined && (
            <div className="flex justify-between">
              <span className="text-stellar-text-muted">Price Change:</span>
              <span
                className={`font-medium ${event.priceChange >= 0 ? "text-green-400" : "text-red-400"}`}
              >
                {event.priceChange >= 0 ? "+" : ""}
                {event.priceChange.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      );

    case "health":
      return (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Asset:</span>
            <span className="text-stellar-text-secondary font-medium">{event.assetSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Previous Score:</span>
            <span className="text-stellar-text-secondary">{event.previousScore.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Current Score:</span>
            <span className="text-stellar-text-secondary font-medium">
              {event.currentScore.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Trend:</span>
            <span
              className={`font-medium capitalize ${
                event.trend === "improving"
                  ? "text-green-400"
                  : event.trend === "deteriorating"
                    ? "text-red-400"
                    : "text-gray-400"
              }`}
            >
              {event.trend}
            </span>
          </div>
        </div>
      );

    case "transaction":
      return (
        <div className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Bridge:</span>
            <span className="text-stellar-text-secondary font-medium">{event.bridge}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Asset:</span>
            <span className="text-stellar-text-secondary">{event.asset}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Amount:</span>
            <span className="text-stellar-text-secondary font-medium">
              {event.amount.toLocaleString()} {event.asset}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Route:</span>
            <span className="text-stellar-text-secondary text-xs">
              {event.sourceChain} → {event.destinationChain}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stellar-text-muted">Tx Hash:</span>
            <code className="text-stellar-text-secondary text-xs font-mono truncate max-w-[200px]">
              {event.txHash}
            </code>
          </div>
        </div>
      );

    case "alert":
      return (
        <div className="mt-3 space-y-2 text-sm">
          {event.assetSymbol && (
            <div className="flex justify-between">
              <span className="text-stellar-text-muted">Asset:</span>
              <span className="text-stellar-text-secondary font-medium">{event.assetSymbol}</span>
            </div>
          )}
          {event.bridgeName && (
            <div className="flex justify-between">
              <span className="text-stellar-text-muted">Bridge:</span>
              <span className="text-stellar-text-secondary font-medium">{event.bridgeName}</span>
            </div>
          )}
          {event.alertType && (
            <div className="flex justify-between">
              <span className="text-stellar-text-muted">Type:</span>
              <span className="text-stellar-text-secondary capitalize">{event.alertType}</span>
            </div>
          )}
        </div>
      );

    default:
      return null;
  }
}

export default function TimelineEventCard({ event, mode = "compact", onRemove }: TimelineEventCardProps) {
  const [isExpanded, setIsExpanded] = useState(mode === "expanded");
  const severityStyle = event.severity ? SEVERITY_STYLES[event.severity] : SEVERITY_STYLES.info;
  const link = getEventLink(event);

  const cardContent = (
    <article
      className="border border-stellar-border rounded-lg p-4 bg-stellar-card hover:bg-stellar-card-hover transition-colors cursor-pointer"
      onClick={() => setIsExpanded((prev) => !prev)}
      aria-expanded={isExpanded}
    >
      <div className="flex items-start gap-3">
        {/* Event icon with severity indicator */}
        <div className="flex-shrink-0 mt-0.5">
          <div className="relative">
            <TimelineEventIcon type={event.type} severity={event.severity} />
            {event.severity && (
              <span
                className={`absolute -top-1 -right-1 w-2 h-2 rounded-full ${severityStyle.dot}`}
                aria-label={`Severity: ${event.severity}`}
              />
            )}
          </div>
        </div>

        {/* Event content */}
        <div className="flex-grow min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${severityStyle.badge}`}
            >
              {event.type}
            </span>
            {event.status && (
              <span className={`text-xs font-medium capitalize ${STATUS_STYLES[event.status]}`}>
                {event.status}
              </span>
            )}
            <span className="text-xs text-stellar-text-muted ml-auto">
              {formatTimestamp(event.timestamp)}
            </span>
          </div>

          <h3 className="text-sm font-semibold text-white truncate">{event.title}</h3>

          <p className="text-sm text-stellar-text-secondary mt-1 line-clamp-2">
            {event.description}
          </p>

          {/* Expanded details */}
          {renderEventDetails(event, isExpanded)}

          {/* Actions */}
          {isExpanded && (
            <div className="mt-3 flex gap-2">
              {link && (
                <Link
                  to={link}
                  className="text-xs text-stellar-blue hover:underline inline-flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  View details
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </Link>
              )}
              {onRemove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(event.id);
                  }}
                  className="text-xs text-red-400 hover:underline ml-auto"
                  aria-label="Remove event"
                >
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );

  return cardContent;
}
