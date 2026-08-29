/**
 * EmptyIllustration
 *
 * A set of lightweight inline SVG illustrations for each Bridge-Watch empty
 * state. All illustrations:
 *   - Use `currentColor` so they inherit the parent's text colour
 *   - Are sized via CSS (pass className or wrap in a sized div)
 *   - Are aria-hidden — the surrounding EmptyState provides the label
 *   - Stay under 2 KB each so they don't bloat the bundle
 */

// ── No bridges ────────────────────────────────────────────────────────────────

export function NoBridges() {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Bridge arch */}
      <path
        d="M10 52 Q40 20 70 52"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.4"
      />
      {/* Pillars */}
      <line x1="22" y1="52" x2="22" y2="68" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      <line x1="58" y1="52" x2="58" y2="68" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      {/* Road */}
      <line x1="6" y1="68" x2="74" y2="68" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
      {/* Question mark */}
      <text x="40" y="47" textAnchor="middle" fontSize="14" fontWeight="bold" fill="currentColor" opacity="0.7">?</text>
    </svg>
  );
}

// ── No alerts ─────────────────────────────────────────────────────────────────

export function NoAlerts() {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Bell */}
      <path
        d="M40 14 C29 14 22 22 22 34 L22 46 L16 52 L64 52 L58 46 L58 34 C58 22 51 14 40 14Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        opacity="0.4"
      />
      {/* Bell bottom */}
      <path
        d="M34 52 C34 55.3 36.7 58 40 58 C43.3 58 46 55.3 46 52"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.4"
      />
      {/* Checkmark — all clear */}
      <circle cx="54" cy="26" r="10" fill="currentColor" opacity="0.15" />
      <path
        d="M49 26 L53 30 L59 22"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
    </svg>
  );
}

// ── No transactions ───────────────────────────────────────────────────────────

export function NoTransactions() {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Arrow right */}
      <path
        d="M16 40 L64 40 M52 28 L64 40 L52 52"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.4"
      />
      {/* Coin stack */}
      <ellipse cx="26" cy="58" rx="12" ry="4" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <rect x="14" y="52" width="24" height="6" rx="2" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <ellipse cx="26" cy="52" rx="12" ry="4" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      {/* Empty label */}
      <path d="M44 58 L72 58" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.2" />
      <path d="M44 64 L60 64" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.2" />
    </svg>
  );
}

// ── No data / search results ──────────────────────────────────────────────────

export function NoResults() {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Magnifying glass */}
      <circle cx="34" cy="34" r="18" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
      <line x1="47" y1="47" x2="66" y2="66" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
      {/* X inside glass */}
      <path
        d="M27 27 L41 41 M41 27 L27 41"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  );
}

// ── Error / disconnected ──────────────────────────────────────────────────────

export function Disconnected() {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Left plug */}
      <rect x="8" y="34" width="26" height="12" rx="3" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
      <line x1="16" y1="34" x2="16" y2="26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
      <line x1="26" y1="34" x2="26" y2="26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
      {/* Right plug */}
      <rect x="46" y="34" width="26" height="12" rx="3" stroke="currentColor" strokeWidth="2.5" opacity="0.4" />
      <line x1="54" y1="46" x2="54" y2="54" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
      <line x1="64" y1="46" x2="64" y2="54" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.4" />
      {/* Gap with lightning */}
      <path
        d="M36 38 L42 35 L38 40 L44 40 L38 43 L44 40"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  );
}

// ── No watchlist items ────────────────────────────────────────────────────────

export function NoWatchlist() {
  return (
    <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      {/* Star outline */}
      <path
        d="M40 14 L45.9 30.2 L63.5 30.2 L49.8 39.8 L55.7 56 L40 46.4 L24.3 56 L30.2 39.8 L16.5 30.2 L34.1 30.2 Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        opacity="0.4"
      />
      {/* Plus hint */}
      <line x1="40" y1="60" x2="40" y2="72" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <line x1="34" y1="66" x2="46" y2="66" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}
