/**
 * Timeline filters component
 */

import { useState } from "react";
import type {
  TimelineFilters as TimelineFiltersType,
  TimelineEventType,
  TimelineEventSeverity,
  TimelineEventStatus,
} from "../../types/timeline";

interface TimelineFiltersProps {
  filters: Partial<TimelineFiltersType>;
  onFiltersChange: (filters: Partial<TimelineFiltersType>) => void;
  onClearFilters: () => void;
}

const EVENT_TYPES: { value: TimelineEventType; label: string }[] = [
  { value: "bridge", label: "Bridge" },
  { value: "asset", label: "Asset" },
  { value: "alert", label: "Alert" },
  { value: "transaction", label: "Transaction" },
  { value: "health", label: "Health" },
];

const SEVERITIES: { value: TimelineEventSeverity; label: string }[] = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

const STATUSES: { value: TimelineEventStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "resolved", label: "Resolved" },
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

export default function TimelineFilters({
  filters,
  onFiltersChange,
  onClearFilters,
}: TimelineFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleTypeToggle = (type: TimelineEventType) => {
    const currentTypes = filters.types || [];
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type];
    onFiltersChange({ ...filters, types: newTypes });
  };

  const handleSeverityToggle = (severity: TimelineEventSeverity) => {
    const currentSeverities = filters.severities || [];
    const newSeverities = currentSeverities.includes(severity)
      ? currentSeverities.filter((s) => s !== severity)
      : [...currentSeverities, severity];
    onFiltersChange({ ...filters, severities: newSeverities });
  };

  const handleStatusToggle = (status: TimelineEventStatus) => {
    const currentStatuses = filters.statuses || [];
    const newStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter((s) => s !== status)
      : [...currentStatuses, status];
    onFiltersChange({ ...filters, statuses: newStatuses });
  };

  const handleSearchChange = (searchQuery: string) => {
    onFiltersChange({ ...filters, searchQuery });
  };

  const activeFilterCount =
    (filters.types?.length || 0) +
    (filters.severities?.length || 0) +
    (filters.statuses?.length || 0) +
    (filters.searchQuery ? 1 : 0) +
    (filters.assetSymbol ? 1 : 0) +
    (filters.bridgeName ? 1 : 0);

  return (
    <div className="space-y-3">
      {/* Search and toggle */}
      <div className="flex gap-2">
        <div className="flex-grow relative">
          <input
            type="text"
            placeholder="Search events..."
            value={filters.searchQuery || ""}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full bg-stellar-card border border-stellar-border rounded px-3 py-2 pl-9 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue"
            aria-label="Search events"
          />
          <svg
            className="absolute left-3 top-2.5 w-4 h-4 text-stellar-text-muted"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>

        <button
          onClick={() => setIsExpanded((prev) => !prev)}
          className="px-4 py-2 bg-stellar-card border border-stellar-border rounded text-sm text-white hover:bg-stellar-card-hover transition-colors flex items-center gap-2"
          aria-label="Toggle filters"
          aria-expanded={isExpanded}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          Filters
          {activeFilterCount > 0 && (
            <span className="bg-stellar-blue text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        {activeFilterCount > 0 && (
          <button
            onClick={onClearFilters}
            className="px-4 py-2 bg-stellar-card border border-stellar-border rounded text-sm text-red-400 hover:bg-stellar-card-hover transition-colors"
            aria-label="Clear all filters"
          >
            Clear
          </button>
        )}
      </div>

      {/* Expanded filters */}
      {isExpanded && (
        <div className="bg-stellar-card border border-stellar-border rounded-lg p-4 space-y-4">
          {/* Event types */}
          <div>
            <label className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wide mb-2">
              Event Types
            </label>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  onClick={() => handleTypeToggle(type.value)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    filters.types?.includes(type.value)
                      ? "bg-stellar-blue text-white"
                      : "bg-stellar-card border border-stellar-border text-stellar-text-secondary hover:bg-stellar-card-hover"
                  }`}
                  aria-pressed={filters.types?.includes(type.value)}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Severities */}
          <div>
            <label className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wide mb-2">
              Severity
            </label>
            <div className="flex flex-wrap gap-2">
              {SEVERITIES.map((severity) => (
                <button
                  key={severity.value}
                  onClick={() => handleSeverityToggle(severity.value)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    filters.severities?.includes(severity.value)
                      ? "bg-stellar-blue text-white"
                      : "bg-stellar-card border border-stellar-border text-stellar-text-secondary hover:bg-stellar-card-hover"
                  }`}
                  aria-pressed={filters.severities?.includes(severity.value)}
                >
                  {severity.label}
                </button>
              ))}
            </div>
          </div>

          {/* Statuses */}
          <div>
            <label className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wide mb-2">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((status) => (
                <button
                  key={status.value}
                  onClick={() => handleStatusToggle(status.value)}
                  className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    filters.statuses?.includes(status.value)
                      ? "bg-stellar-blue text-white"
                      : "bg-stellar-card border border-stellar-border text-stellar-text-secondary hover:bg-stellar-card-hover"
                  }`}
                  aria-pressed={filters.statuses?.includes(status.value)}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>

          {/* Additional filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="asset-filter"
                className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wide mb-1"
              >
                Asset Symbol
              </label>
              <input
                id="asset-filter"
                type="text"
                placeholder="e.g., USDC"
                value={filters.assetSymbol || ""}
                onChange={(e) => onFiltersChange({ ...filters, assetSymbol: e.target.value })}
                className="w-full bg-stellar-card border border-stellar-border rounded px-3 py-1.5 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue"
              />
            </div>

            <div>
              <label
                htmlFor="bridge-filter"
                className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wide mb-1"
              >
                Bridge Name
              </label>
              <input
                id="bridge-filter"
                type="text"
                placeholder="e.g., Circle"
                value={filters.bridgeName || ""}
                onChange={(e) => onFiltersChange({ ...filters, bridgeName: e.target.value })}
                className="w-full bg-stellar-card border border-stellar-border rounded px-3 py-1.5 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
