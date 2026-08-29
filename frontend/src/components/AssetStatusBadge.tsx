/**
 * AssetStatusBadge (#495)
 *
 * Standardised status badge for assets across all views.
 * Variants : healthy | warning | critical | unknown | paused | syncing
 * Sizes    : sm | md | lg
 * Dot mode : renders a coloured dot instead of a pill (dense tables)
 */

export type AssetStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "unknown"
  | "paused"
  | "syncing";

export type BadgeSize = "sm" | "md" | "lg";

export interface AssetStatusBadgeProps {
  status: AssetStatus;
  /** Override the default human-readable label */
  label?: string;
  size?: BadgeSize;
  /** Dot-only mode (useful in dense tables) */
  dot?: boolean;
  className?: string;
}

interface StatusConfig {
  label: string;
  colours: string;
  dotColour: string;
  ariaDescription: string;
  animate?: boolean;
}

const STATUS_CONFIG: Record<AssetStatus, StatusConfig> = {
  healthy: {
    label: "Healthy",
    colours: "bg-green-500/15 text-green-400 border-green-500/30",
    dotColour: "bg-green-400",
    ariaDescription: "Asset is healthy",
  },
  warning: {
    label: "Warning",
    colours: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    dotColour: "bg-yellow-400",
    ariaDescription: "Asset requires attention",
  },
  critical: {
    label: "Critical",
    colours: "bg-red-500/15 text-red-400 border-red-500/30",
    dotColour: "bg-red-400",
    ariaDescription: "Asset is in a critical state",
    animate: true,
  },
  unknown: {
    label: "Unknown",
    colours: "bg-gray-500/15 text-gray-400 border-gray-500/30",
    dotColour: "bg-gray-500",
    ariaDescription: "Asset status is unknown",
  },
  paused: {
    label: "Paused",
    colours: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    dotColour: "bg-blue-400",
    ariaDescription: "Asset monitoring is paused",
  },
  syncing: {
    label: "Syncing",
    colours: "bg-purple-500/15 text-purple-400 border-purple-500/30",
    dotColour: "bg-purple-400",
    ariaDescription: "Asset is currently syncing",
    animate: true,
  },
};

const SIZE_CLASSES: Record<BadgeSize, { badge: string; dot: string }> = {
  sm: { badge: "gap-1 px-1.5 py-0.5 text-xs", dot: "h-1.5 w-1.5" },
  md: { badge: "gap-1.5 px-2.5 py-1 text-xs", dot: "h-2 w-2" },
  lg: { badge: "gap-2 px-3 py-1.5 text-sm", dot: "h-2.5 w-2.5" },
};

export function AssetStatusBadge({
  status,
  label,
  size = "md",
  dot = false,
  className = "",
}: AssetStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const sizes = SIZE_CLASSES[size];
  const displayLabel = label ?? config.label;

  if (dot) {
    return (
      <span
        role="status"
        aria-label={config.ariaDescription}
        title={displayLabel}
        className={`relative inline-flex items-center justify-center ${className}`}
      >
        {config.animate && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.dotColour} opacity-60`}
            aria-hidden="true"
          />
        )}
        <span
          className={`relative inline-block rounded-full ${sizes.dot} ${config.dotColour}`}
          aria-hidden="true"
        />
        <span className="sr-only">{displayLabel}</span>
      </span>
    );
  }

  return (
    <span
      role="status"
      aria-label={config.ariaDescription}
      className={[
        "inline-flex items-center rounded-full border font-medium",
        sizes.badge,
        config.colours,
        className,
      ].join(" ")}
    >
      {config.animate && (
        <span className={`relative mr-0.5 flex h-2 w-2`} aria-hidden="true">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dotColour} opacity-60`} />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dotColour}`} />
        </span>
      )}
      {displayLabel}
    </span>
  );
}


