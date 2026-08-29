import BridgeSummaryCard from "./BridgeSummaryCard";
import type { BridgeSummary } from "../../types";

interface BridgeSummaryGridProps {
  /** Array of bridge summaries to display */
  summaries?: BridgeSummary[];
  /** When true, shows loading skeletons for each card */
  isLoading?: boolean;
  /** When true, shows error state */
  isError?: boolean;
  /** Optional error message */
  error?: string | null;
  /** Card variant to display */
  variant?: "compact" | "standard" | "detailed";
  /** Optional CSS classes for the grid container */
  className?: string;
  /** Number of skeleton cards to show while loading */
  loadingCount?: number;
}

/**
 * BridgeSummaryGrid component
 *
 * Renders a responsive grid of bridge summary cards.
 * Handles loading and error states for the entire collection.
 *
 * @example
 * ```tsx
 * const { data: summaries, isLoading } = useBridgeSummaries();
 *
 * <BridgeSummaryGrid
 *   summaries={summaries}
 *   isLoading={isLoading}
 *   variant="standard"
 * />
 * ```
 */
export default function BridgeSummaryGrid({
  summaries = [],
  isLoading = false,
  isError = false,
  error = null,
  variant = "standard",
  className = "",
  loadingCount = 4,
}: BridgeSummaryGridProps) {
  // Responsive grid: 1 column on mobile, 2 on tablet, 3 on desktop, 4 on large screens
  const gridClasses = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4";

  // Error state for entire grid
  if (isError) {
    return (
      <div className={`${gridClasses} ${className}`} role="alert">
        <div className="col-span-full bg-stellar-card border border-stellar-border rounded-lg p-6 text-center">
          <p className="text-stellar-text-primary font-semibold">
            Unable to load bridges
          </p>
          {error && (
            <p className="text-stellar-text-secondary text-sm mt-2">{error}</p>
          )}
        </div>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className={`${gridClasses} ${className}`} role="status" aria-label="Loading bridge summaries">
        {Array.from({ length: loadingCount }).map((_, i) => (
          <BridgeSummaryCard
            key={`skeleton-${i}`}
            isLoading
            variant={variant}
            data-testid={`bridge-summary-card-skeleton-${i}`}
          />
        ))}
      </div>
    );
  }

  // Empty state
  if (summaries.length === 0) {
    return (
      <div className={`${gridClasses} ${className}`}>
        <div className="col-span-full bg-stellar-card border border-stellar-border rounded-lg p-8 text-center">
          <p className="text-stellar-text-secondary">No bridges available</p>
        </div>
      </div>
    );
  }

  // Populated state
  return (
    <div
      className={`${gridClasses} ${className}`}
      role="region"
      aria-label="Bridge summaries"
    >
      {summaries.map((summary) => (
        <BridgeSummaryCard
          key={summary.id}
          summary={summary}
          variant={variant}
          data-testid={`bridge-summary-card-${summary.id}`}
        />
      ))}
    </div>
  );
}
