/**
 * EmptyState Variants
 *
 * Ready-to-use compositions of EmptyState + EmptyIllustration for each
 * Bridge-Watch view. Import the variant that matches the page rather than
 * constructing props from scratch — this keeps copy and illustrations
 * consistent across the app.
 *
 * Usage:
 *   import { EmptyBridges, EmptyAlerts } from "@/components/EmptyState";
 *
 *   // In a component:
 *   if (bridges.length === 0) return <EmptyBridges onAddBridge={openModal} />;
 */

import { EmptyState } from "./EmptyState";
import * as EmptyIllustration from "./EmptyIllustration";

// ── No bridges ────────────────────────────────────────────────────────────────

interface EmptyBridgesProps {
  /** Whether any filters are active — changes copy and actions. */
  hasFilters?: boolean;
  onClearFilters?: () => void;
}

export function EmptyBridges({ hasFilters, onClearFilters }: EmptyBridgesProps) {
  if (hasFilters) {
    return (
      <EmptyState
        variant="page"
        illustration={<EmptyIllustration.NoResults />}
        title="No bridges match your filters"
        description="Try adjusting your search or filter criteria to find what you're looking for."
        actions={[
          { label: "Clear filters", onClick: onClearFilters, variant: "primary" },
        ]}
        ariaLabel="No bridges match the current filters"
      />
    );
  }

  return (
    <EmptyState
      variant="page"
      illustration={<EmptyIllustration.NoBridges />}
      title="No bridges yet"
      description="Bridge-Watch hasn't detected any bridges. Data is fetched from the Stellar network automatically — check back shortly."
      ariaLabel="No bridges found"
    />
  );
}

// ── No alerts ─────────────────────────────────────────────────────────────────

interface EmptyAlertsProps {
  /** The alerts sub-view the user is on (active, history, suppressed). */
  view?: "active" | "history" | "suppressed";
  onConfigureAlerts?: () => void;
}

export function EmptyAlerts({ view = "active", onConfigureAlerts }: EmptyAlertsProps) {
  const copy: Record<string, { title: string; description: string }> = {
    active: {
      title: "No active alerts",
      description:
        "All monitored bridges are within their configured thresholds. Alerts will appear here when anomalies are detected.",
    },
    history: {
      title: "No alert history",
      description:
        "No alerts have been triggered yet. Past alerts will appear here once thresholds are breached.",
    },
    suppressed: {
      title: "No suppressed alerts",
      description:
        "You haven't suppressed any alerts. Suppressed alerts are temporarily muted and won't trigger notifications.",
    },
  };

  return (
    <EmptyState
      variant="card"
      illustration={<EmptyIllustration.NoAlerts />}
      title={copy[view].title}
      description={copy[view].description}
      actions={
        view === "active" && onConfigureAlerts
          ? [{ label: "Configure alert rules", onClick: onConfigureAlerts, variant: "secondary" }]
          : []
      }
      ariaLabel={copy[view].title}
    />
  );
}

// ── No transactions ───────────────────────────────────────────────────────────

interface EmptyTransactionsProps {
  bridgeName?: string;
}

export function EmptyTransactions({ bridgeName }: EmptyTransactionsProps) {
  return (
    <EmptyState
      variant="card"
      illustration={<EmptyIllustration.NoTransactions />}
      title="No transactions found"
      description={
        bridgeName
          ? `No transactions have been recorded for ${bridgeName} in the selected time range.`
          : "No transactions match the selected filters. Try a different time range."
      }
      ariaLabel="No transactions found"
    />
  );
}

// ── No search results ─────────────────────────────────────────────────────────

interface EmptySearchProps {
  query?: string;
  onClear?: () => void;
}

export function EmptySearch({ query, onClear }: EmptySearchProps) {
  return (
    <EmptyState
      variant="card"
      illustration={<EmptyIllustration.NoResults />}
      title="No results found"
      description={
        query
          ? `No matches for "${query}". Try a different search term.`
          : "No matches found. Try a different search term."
      }
      actions={onClear ? [{ label: "Clear search", onClick: onClear, variant: "secondary" }] : []}
      ariaLabel={query ? `No results for ${query}` : "No search results"}
    />
  );
}

// ── Connection error ──────────────────────────────────────────────────────────

interface EmptyConnectionProps {
  onRetry?: () => void;
}

export function EmptyConnection({ onRetry }: EmptyConnectionProps) {
  return (
    <EmptyState
      variant="page"
      illustration={<EmptyIllustration.Disconnected />}
      title="Unable to connect"
      description="Bridge-Watch can't reach the Stellar network right now. Check your connection and try again."
      actions={onRetry ? [{ label: "Retry", onClick: onRetry, variant: "primary" }] : []}
      ariaLabel="Connection error"
    />
  );
}

// ── No watchlist items ────────────────────────────────────────────────────────

interface EmptyWatchlistProps {
  onBrowseBridges?: () => void;
}

export function EmptyWatchlist({ onBrowseBridges }: EmptyWatchlistProps) {
  return (
    <EmptyState
      variant="card"
      illustration={<EmptyIllustration.NoWatchlist />}
      title="Your watchlist is empty"
      description="Star bridges you want to track closely. They'll show up here for quick access."
      actions={
        onBrowseBridges
          ? [{ label: "Browse bridges", onClick: onBrowseBridges, href: "/bridges", variant: "primary" }]
          : []
      }
      ariaLabel="Watchlist is empty"
    />
  );
}

// ── Generic data loading error ────────────────────────────────────────────────

interface EmptyErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function EmptyError({ message, onRetry }: EmptyErrorProps) {
  return (
    <EmptyState
      variant="card"
      illustration={<EmptyIllustration.Disconnected />}
      title="Something went wrong"
      description={message ?? "An unexpected error occurred while loading data. Please try again."}
      actions={onRetry ? [{ label: "Try again", onClick: onRetry, variant: "primary" }] : []}
      ariaLabel="Error loading data"
    />
  );
}
