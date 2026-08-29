import { useState } from "react";
import { useIncidentFeed, type IncidentSeverity, type IncidentStatus, type BridgeIncident } from "../hooks/useIncidentFeed";

const SEVERITY_ORDER: Record<IncidentSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SEVERITY_STYLES: Record<IncidentSeverity, { badge: string; dot: string }> = {
  critical: { badge: "bg-red-900/50 text-red-400 border border-red-700", dot: "bg-red-500" },
  high: { badge: "bg-orange-900/50 text-orange-400 border border-orange-700", dot: "bg-orange-500" },
  medium: { badge: "bg-yellow-900/50 text-yellow-400 border border-yellow-700", dot: "bg-yellow-500" },
  low: { badge: "bg-blue-900/50 text-blue-400 border border-blue-700", dot: "bg-blue-500" },
};

const STATUS_STYLES: Record<IncidentStatus, string> = {
  open: "text-red-400",
  investigating: "text-yellow-400",
  resolved: "text-green-400",
};

interface IncidentCardProps {
  incident: BridgeIncident;
  isUnread: boolean;
  onMarkRead: (id: string) => void;
}

function IncidentCard({ incident, isUnread, onMarkRead }: IncidentCardProps) {
  const [expanded, setExpanded] = useState(false);
  const severityStyle = SEVERITY_STYLES[incident.severity];

  return (
    <article
      className={`border rounded-lg p-4 transition-colors cursor-pointer hover:bg-stellar-card-hover ${
        isUnread
          ? "border-stellar-border bg-stellar-card"
          : "border-stellar-border/50 bg-stellar-card/50 opacity-80"
      }`}
      onClick={() => {
        setExpanded((prev) => !prev);
        if (isUnread) onMarkRead(incident.id);
      }}
      aria-expanded={expanded}
    >
      <div className="flex items-start gap-3">
        {/* Unread dot */}
        <span
          className={`mt-1.5 w-2 h-2 flex-shrink-0 rounded-full ${
            isUnread ? severityStyle.dot : "bg-transparent"
          }`}
          aria-label={isUnread ? "Unread" : "Read"}
        />

        <div className="flex-grow min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wide ${severityStyle.badge}`}
              aria-label={`Severity: ${incident.severity}`}
            >
              {incident.severity}
            </span>
            <span className={`text-xs font-medium capitalize ${STATUS_STYLES[incident.status]}`}>
              {incident.status}
            </span>
            <span className="text-xs text-stellar-text-muted ml-auto">
              {new Date(incident.occurredAt).toLocaleString()}
            </span>
          </div>

          <h3 className={`text-sm font-semibold truncate ${isUnread ? "text-white" : "text-stellar-text-secondary"}`}>
            {incident.title}
          </h3>

          <div className="flex flex-wrap gap-2 mt-1 items-center">
            <span className="text-xs text-stellar-text-muted">
              Bridge: <span className="text-stellar-text-secondary">{incident.bridgeId}</span>
            </span>
            {incident.assetCode && (
              <span className="text-xs text-stellar-text-muted">
                Asset: <span className="text-stellar-text-secondary">{incident.assetCode}</span>
              </span>
            )}
            {incident.sourceRepository && (
              <span className="text-xs text-stellar-text-muted inline-flex items-center gap-1">
                {incident.sourceRepoAvatarUrl && (
                  <img
                    src={incident.sourceRepoAvatarUrl}
                    alt="Repository avatar"
                    className="w-4 h-4 rounded-full"
                    loading="lazy"
                  />
                )}
                Repo: <span className="text-stellar-text-secondary">{incident.sourceRepository}</span>
              </span>
            )}
          </div>

          {expanded && (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-stellar-text-secondary">{incident.description}</p>

              {incident.followUpActions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-stellar-text-muted uppercase tracking-wide mb-1">
                    Follow-up Actions
                  </p>
                  <ul className="space-y-1">
                    {incident.followUpActions.map((action, i) => (
                      <li key={i} className="text-sm text-stellar-text-secondary flex gap-2">
                        <span className="text-stellar-blue">•</span>
                        {action}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(incident.sourceUrl || incident.sourceType || incident.sourceActor) && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-stellar-text-muted">
                  {incident.sourceType && (
                    <span className="uppercase tracking-wide px-2 py-0.5 rounded border border-stellar-border bg-stellar-card">
                      {incident.sourceType}
                    </span>
                  )}
                  {incident.sourceActor && <span>Actor: {incident.sourceActor}</span>}
                  {incident.sourceUrl && (
                    <a
                      href={incident.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-stellar-blue hover:underline inline-flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Open incident source link"
                    >
                      Source link
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>
              )}

              {incident.resolvedAt && (
                <p className="text-xs text-green-400">
                  Resolved at {new Date(incident.resolvedAt).toLocaleString()}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

interface BridgeIncidentFeedProps {
  defaultBridgeFilter?: string;
  defaultAssetFilter?: string;
  compact?: boolean;
}

export default function BridgeIncidentFeed({
  defaultBridgeFilter,
  defaultAssetFilter,
  compact = false,
}: BridgeIncidentFeedProps) {
  const [bridgeFilter, setBridgeFilter] = useState(defaultBridgeFilter ?? "");
  const [assetFilter, setAssetFilter] = useState(defaultAssetFilter ?? "");
  const [severityFilter, setSeverityFilter] = useState<IncidentSeverity | "">("");
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "">("");

  const { incidents, total, unreadCount, isLoading, error, readIds, markRead } = useIncidentFeed({
    bridgeId: bridgeFilter || undefined,
    assetCode: assetFilter || undefined,
    severity: (severityFilter || undefined) as IncidentSeverity | undefined,
    status: (statusFilter || undefined) as IncidentStatus | undefined,
  });

  const sorted = [...incidents].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  const inputClass =
    "bg-stellar-card border border-stellar-border rounded px-3 py-1.5 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full sm:w-auto";

  return (
    <section className="space-y-4" aria-label="Bridge Incident Feed">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-white">Incident Feed</h2>
          {unreadCount > 0 && (
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        <span className="text-xs text-stellar-text-muted">{total} total</span>
      </div>

      {/* Filters */}
      {!compact && (
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Filter by bridge"
            value={bridgeFilter}
            onChange={(e) => setBridgeFilter(e.target.value)}
            className={inputClass}
            aria-label="Filter by bridge"
          />
          <input
            type="text"
            placeholder="Filter by asset"
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className={inputClass}
            aria-label="Filter by asset"
          />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as IncidentSeverity | "")}
            className={inputClass}
            aria-label="Filter by severity"
          >
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as IncidentStatus | "")}
            className={inputClass}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      )}

      {/* List */}
      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="border border-stellar-border rounded-lg p-4 animate-pulse bg-stellar-card">
              <div className="h-4 bg-stellar-border rounded w-1/4 mb-2" />
              <div className="h-3 bg-stellar-border rounded w-3/4" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="border border-red-700 rounded-lg p-4 bg-red-900/20 text-red-400 text-sm">
          Failed to load incidents. Please try again.
        </div>
      )}

      {!isLoading && !error && sorted.length === 0 && (
        <div className="border border-stellar-border rounded-lg p-8 text-center text-stellar-text-secondary">
          <svg className="w-12 h-12 mx-auto mb-3 text-stellar-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="font-medium text-white">No incidents found</p>
          <p className="text-sm mt-1">All bridges are operating normally.</p>
        </div>
      )}

      {!isLoading && !error && sorted.length > 0 && (
        <div className="space-y-2">
          {sorted.map((incident) => (
            <IncidentCard
              key={incident.id}
              incident={incident}
              isUnread={!readIds.has(incident.id)}
              onMarkRead={markRead}
            />
          ))}
        </div>
      )}
    </section>
  );
}
