import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

export type SummaryTrendDirection = "up" | "down" | "neutral";
export type SummaryFieldStatus = "healthy" | "warning" | "critical" | "neutral";
export type EntitySummaryMode = "compact" | "expanded";

export interface EntitySummaryField {
  /** Stable id for the field. */
  id: string;
  /** Short field label, e.g. "Health". */
  label: string;
  /** Primary value shown for the field. */
  value: ReactNode;
  /** Optional trend chip. */
  trend?: { direction: SummaryTrendDirection; label?: string };
  /** Optional status used to colour the value dot. */
  status?: SummaryFieldStatus;
  /** Extra context shown only in expanded mode. */
  hint?: string;
  /** Router path for a drilldown link rendered under the field. */
  to?: string;
  /** Click handler for an in-page drilldown (e.g. switching tabs). */
  onDrilldown?: () => void;
  /** Label for the drilldown affordance. Defaults to "View". */
  drilldownLabel?: string;
}

interface EntitySummaryBannerProps {
  /** Context label/badge, e.g. "Asset" or "Bridge". Drives context sensitivity. */
  entityType: string;
  /** Primary entity title, e.g. the symbol or bridge name. */
  title: string;
  /** Optional supporting copy below the title. */
  subtitle?: string;
  /** Most important summary fields for the selected entity. */
  fields: EntitySummaryField[];
  /** Render skeletons while underlying data loads. */
  loading?: boolean;
  /** Initial layout density. Users can toggle between compact and expanded. */
  defaultMode?: EntitySummaryMode;
  /** Optional leading icon/emoji. */
  icon?: ReactNode;
  /** Optional right-aligned actions (buttons, etc.). */
  actions?: ReactNode;
  className?: string;
}

const trendClasses: Record<SummaryTrendDirection, string> = {
  up: "border-green-400/30 bg-green-500/10 text-green-300",
  down: "border-red-400/30 bg-red-500/10 text-red-300",
  neutral: "border-stellar-border bg-stellar-dark/50 text-stellar-text-secondary",
};

const trendGlyph: Record<SummaryTrendDirection, string> = {
  up: "↑",
  down: "↓",
  neutral: "→",
};

const statusDot: Record<SummaryFieldStatus, string> = {
  healthy: "bg-green-400",
  warning: "bg-yellow-400",
  critical: "bg-red-400",
  neutral: "bg-stellar-text-secondary",
};

function FieldSkeleton({ expanded }: { readonly expanded: boolean }) {
  return (
    <div className="rounded-lg border border-stellar-border bg-stellar-dark/40 p-3">
      <div className="animate-pulse space-y-2">
        <div className="h-3 w-16 rounded bg-stellar-border" />
        <div className="h-6 w-24 rounded bg-stellar-border" />
        {expanded ? <div className="h-3 w-full rounded bg-stellar-border" /> : null}
      </div>
    </div>
  );
}

function SummaryFieldCard({
  field,
  expanded,
}: {
  readonly field: EntitySummaryField;
  readonly expanded: boolean;
}) {
  const drilldownLabel = field.drilldownLabel ?? "View";

  return (
    <div className="rounded-lg border border-stellar-border bg-stellar-dark/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-stellar-text-secondary">
        {field.label}
      </p>
      <div className="mt-1 flex items-center gap-2">
        {field.status ? (
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${statusDot[field.status]}`}
            aria-hidden="true"
          />
        ) : null}
        <span className="text-lg font-semibold text-white">{field.value}</span>
        {field.trend ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${trendClasses[field.trend.direction]}`}
          >
            <span aria-hidden="true">{trendGlyph[field.trend.direction]}</span>
            {field.trend.label ?? field.trend.direction}
          </span>
        ) : null}
      </div>

      {expanded && field.hint ? (
        <p className="mt-2 text-xs text-stellar-text-secondary">{field.hint}</p>
      ) : null}

      {field.to ? (
        <Link
          to={field.to}
          className="mt-2 inline-flex items-center text-xs font-medium text-stellar-blue hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
        >
          {drilldownLabel} →
        </Link>
      ) : field.onDrilldown ? (
        <button
          type="button"
          onClick={field.onDrilldown}
          className="mt-2 inline-flex items-center text-xs font-medium text-stellar-blue hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
        >
          {drilldownLabel} →
        </button>
      ) : null}
    </div>
  );
}

/**
 * Context-sensitive summary banner for a selected entity (asset, bridge, etc.).
 * Shows the most important summary fields in a compact grid with a loading
 * state, optional drilldown links, and a compact/expanded layout toggle.
 */
export default function EntitySummaryBanner({
  entityType,
  title,
  subtitle,
  fields,
  loading = false,
  defaultMode = "compact",
  icon,
  actions,
  className = "",
}: EntitySummaryBannerProps) {
  const [mode, setMode] = useState<EntitySummaryMode>(defaultMode);
  const expanded = mode === "expanded";
  const skeletonCount = Math.max(fields.length, 4);

  return (
    <section
      aria-label={`${entityType} summary: ${title}`}
      className={`rounded-2xl border border-stellar-border bg-gradient-to-br from-stellar-card via-stellar-card to-stellar-dark/40 p-5 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon ? (
            <span className="text-2xl" role="img" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div>
            <span className="inline-block rounded-full border border-stellar-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-stellar-text-secondary">
              {entityType}
            </span>
            <h2 className="mt-1 text-2xl font-bold text-white">{title}</h2>
            {subtitle ? (
              <p className="mt-1 text-sm text-stellar-text-secondary">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={() => setMode((prev) => (prev === "compact" ? "expanded" : "compact"))}
            aria-pressed={expanded}
            className="rounded-full border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
          >
            {expanded ? "Compact view" : "Expanded view"}
          </button>
        </div>
      </div>

      <div
        className={`mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 ${
          expanded ? "lg:grid-cols-3" : "lg:grid-cols-4"
        }`}
      >
        {loading
          ? Array.from({ length: skeletonCount }, (_, index) => (
              <FieldSkeleton key={index} expanded={expanded} />
            ))
          : fields.map((field) => (
              <SummaryFieldCard key={field.id} field={field} expanded={expanded} />
            ))}
      </div>
    </section>
  );
}
