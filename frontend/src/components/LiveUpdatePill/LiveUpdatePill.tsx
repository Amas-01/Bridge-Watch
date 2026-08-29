import { useRelativeTime, type TimestampInput } from "../../hooks/useRelativeTime";

interface LiveUpdatePillProps {
  /** When the view's data was last updated. */
  updatedAt: TimestampInput;
  /** Mark the value stale once older than this (ms). Defaults to 60s. */
  staleAfterMs?: number;
  /** Whether the view is actively polling for live updates. */
  polling?: boolean;
  /** Prefix for the visible/announced text. Defaults to "Updated". */
  label?: string;
  className?: string;
}

type PillState = "live" | "fresh" | "stale" | "unknown";

const dotClasses: Record<PillState, string> = {
  live: "bg-green-400",
  fresh: "bg-green-400",
  stale: "bg-yellow-400",
  unknown: "bg-stellar-text-secondary",
};

const containerClasses: Record<PillState, string> = {
  live: "border-green-400/30 bg-green-500/10 text-green-300",
  fresh: "border-stellar-border bg-stellar-dark/50 text-stellar-text-secondary",
  stale: "border-yellow-400/30 bg-yellow-500/10 text-yellow-300",
  unknown: "border-stellar-border bg-stellar-dark/50 text-stellar-text-secondary",
};

/**
 * Compact pill showing how recently a view updated, whether it is stale, and
 * whether it is polling live. Designed to be reused across views.
 */
export default function LiveUpdatePill({
  updatedAt,
  staleAfterMs = 60_000,
  polling = false,
  label = "Updated",
  className = "",
}: LiveUpdatePillProps) {
  const { text, isStale, ageMs } = useRelativeTime(updatedAt, { staleAfterMs });

  const state: PillState =
    ageMs === null ? "unknown" : isStale ? "stale" : polling ? "live" : "fresh";

  const suffix = state === "stale" ? " · stale" : state === "live" ? " · live" : "";
  const announced =
    ageMs === null
      ? `${label}: never`
      : `${label} ${text}${isStale ? ", data is stale" : polling ? ", live updates on" : ""}`;

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={announced}
      title={announced}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs ${containerClasses[state]} ${className}`}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {state === "live" ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        ) : null}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotClasses[state]}`} />
      </span>
      <span aria-hidden="true">
        {ageMs === null ? `${label}: never` : `${label} ${text}${suffix}`}
      </span>
    </span>
  );
}
