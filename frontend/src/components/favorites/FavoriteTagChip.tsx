import type { KeyboardEvent } from "react";

export interface FavoriteTagChipProps {
  /** Whether this item is marked favorite */
  active: boolean;
  /** Accessible name, e.g. asset symbol */
  label: string;
  onToggle: () => void;
  /** Show smaller padding for dense toolbars */
  compact?: boolean;
  className?: string;
}

/**
 * Compact keyboard-accessible favorite toggle styled as a chip.
 */
export default function FavoriteTagChip({
  active,
  label,
  onToggle,
  compact = false,
  className = "",
}: FavoriteTagChipProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={active ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      title={active ? "Remove favorite" : "Mark favorite"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      onKeyDown={handleKeyDown}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-2 focus:ring-offset-stellar-dark ${
        compact ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      } ${
        active
          ? "border-amber-400/60 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
          : "border-stellar-border bg-stellar-dark/40 text-stellar-text-secondary hover:border-stellar-blue/50 hover:text-stellar-text-primary"
      } ${className}`}
    >
      <span aria-hidden className={active ? "text-amber-400" : "text-stellar-text-muted"}>
        ★
      </span>
      <span className="max-w-[10rem] truncate">{label}</span>
    </button>
  );
}
