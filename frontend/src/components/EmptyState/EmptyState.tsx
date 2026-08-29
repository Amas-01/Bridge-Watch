import type { ReactNode } from "react";
import { Link } from "react-router-dom";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EmptyStateAction {
  /** Button label */
  label: string;
  /** Route to navigate to (renders a <Link>) */
  href?: string;
  /** Click handler (renders a <button>) */
  onClick?: () => void;
  /** Visual variant — primary is gold-filled, secondary is outlined */
  variant?: "primary" | "secondary";
}

export interface EmptyStateProps {
  /**
   * Pre-built illustration or any custom ReactNode.
   * Use one of the exported <EmptyIllustration.*> helpers for consistency,
   * or pass your own SVG / img element.
   */
  illustration?: ReactNode;
  /** Short, sentence-cased headline. Keep under 6 words. */
  title: string;
  /** One or two sentences explaining why the state is empty and what to do. */
  description?: string;
  /** Up to two action buttons. First is treated as primary by default. */
  actions?: EmptyStateAction[];
  /**
   * Layout variant:
   *  - "page"   — centred, large, used for full-page empty routes
   *  - "card"   — compact, used inside cards / panels
   *  - "inline" — minimal, single-line, used inside tables or lists
   */
  variant?: "page" | "card" | "inline";
  /** Extra Tailwind classes applied to the root element. */
  className?: string;
  /** aria-label for the section. Defaults to `title`. */
  ariaLabel?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ActionButton({ action, index }: { action: EmptyStateAction; index: number }) {
  const isPrimary = action.variant ? action.variant === "primary" : index === 0;

  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-dark";

  const primary =
    "bg-stellar-blue text-white hover:bg-blue-600 active:bg-blue-700";

  const secondary =
    "border border-stellar-border text-stellar-text-secondary hover:border-stellar-blue hover:text-white";

  const cls = `${base} ${isPrimary ? primary : secondary}`;

  if (action.href) {
    return (
      <Link to={action.href} className={cls}>
        {action.label}
      </Link>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * EmptyState
 *
 * Standardised empty-state component for Bridge-Watch. Renders an optional
 * illustration, a title, a description, and up to two action buttons.
 *
 * @example
 * // Full-page empty route
 * <EmptyState
 *   variant="page"
 *   illustration={<EmptyIllustration.NoBridges />}
 *   title="No bridges found"
 *   description="No bridges match your current filters. Try adjusting the search."
 *   actions={[{ label: "Clear filters", onClick: clearFilters }]}
 * />
 *
 * @example
 * // Inside a card
 * <EmptyState
 *   variant="card"
 *   illustration={<EmptyIllustration.NoAlerts />}
 *   title="No active alerts"
 *   description="Everything is healthy. Alerts will appear here when thresholds are breached."
 * />
 */
export function EmptyState({
  illustration,
  title,
  description,
  actions = [],
  variant = "card",
  className = "",
  ariaLabel,
}: EmptyStateProps) {
  const variantStyles: Record<string, string> = {
    page: "py-24 px-6",
    card: "py-12 px-6",
    inline: "py-6 px-4",
  };

  const illustrationSize: Record<string, string> = {
    page: "w-24 h-24",
    card: "w-16 h-16",
    inline: "w-10 h-10",
  };

  const titleSize: Record<string, string> = {
    page: "text-xl font-semibold",
    card: "text-base font-semibold",
    inline: "text-sm font-medium",
  };

  return (
    <section
      aria-label={ariaLabel ?? title}
      className={`flex flex-col items-center justify-center text-center ${variantStyles[variant]} ${className}`}
    >
      {illustration && (
        <div
          className={`mb-4 text-stellar-text-secondary ${illustrationSize[variant]}`}
          aria-hidden="true"
        >
          {illustration}
        </div>
      )}

      <h2 className={`text-stellar-text-primary ${titleSize[variant]} mb-2`}>
        {title}
      </h2>

      {description && (
        <p
          className={`text-stellar-text-secondary max-w-sm leading-relaxed ${
            variant === "inline" ? "text-xs" : "text-sm"
          } mb-${actions.length > 0 ? "6" : "0"}`}
        >
          {description}
        </p>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          {actions.map((action, i) => (
            <ActionButton key={action.label} action={action} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
