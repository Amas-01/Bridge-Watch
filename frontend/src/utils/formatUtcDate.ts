const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Formats an ISO date/timestamp string as "Mon D" using UTC date components,
 * so the displayed calendar day never shifts based on the viewer's local
 * timezone offset (e.g. a date-only string like "2024-01-15" always renders
 * as "Jan 15", even for viewers in negative UTC offsets).
 */
export function formatUtcDate(value: string): string {
  const d = new Date(value);
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}
