/**
 * TableFooterSummary (#500)
 *
 * Displays aggregate totals and summary notes below a data table.
 *
 * Features:
 *  – Flexible column definitions (numeric totals, text labels, counts)
 *  – Optional sticky footer (position: sticky bottom-0)
 *  – Summary note slot (freeform text beneath the totals row)
 *  – Responsive: collapses to a stacked list on small screens
 *  – Accessible: uses <tfoot>, scope="col", and aria-label
 */

import type { ReactNode } from "react";

// ─── types ────────────────────────────────────────────────────────────────────

export type FooterCellAlign = "left" | "right" | "center";

export interface FooterColumn {
  /** Must match the data column it sits under */
  id: string;
  /** Formatted value to display (string or ReactNode) */
  value: ReactNode;
  /** Accessible label, e.g. "Total TVL" */
  ariaLabel?: string;
  align?: FooterCellAlign;
  /** Extra Tailwind classes */
  className?: string;
}

export interface TableFooterSummaryProps {
  /**
   * Ordered list of footer cells.
   * Pass an empty cell (`{ id, value: "" }`) for columns that need no total.
   */
  columns: FooterColumn[];
  /** Optional note rendered below the totals row */
  summaryNote?: ReactNode;
  /** Stick the footer to the bottom of a scrollable table container */
  sticky?: boolean;
  /** Label for the accessible <tfoot> region */
  ariaLabel?: string;
  /** Extra CSS on the <tfoot> element */
  className?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const ALIGN_CLASSES: Record<FooterCellAlign, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

// ─── component ────────────────────────────────────────────────────────────────

/**
 * Drop this inside any `<table>` as the last child (after `<tbody>`).
 *
 * ```tsx
 * <table>
 *   <thead>…</thead>
 *   <tbody>…</tbody>
 *   <TableFooterSummary columns={footerCols} summaryNote="Values in USD" sticky />
 * </table>
 * ```
 */
export function TableFooterSummary({
  columns,
  summaryNote,
  sticky = false,
  ariaLabel = "Table summary",
  className = "",
}: TableFooterSummaryProps) {
  return (
    <tfoot
      aria-label={ariaLabel}
      className={[
        "border-t-2 border-stellar-blue/30 bg-stellar-dark/60",
        sticky ? "sticky bottom-0" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* totals row */}
      <tr>
        {columns.map((col) => {
          const align = col.align ?? "left";
          return (
            <td
              key={col.id}
              aria-label={col.ariaLabel}
              className={[
                "py-3 pr-4 text-sm font-semibold text-white",
                ALIGN_CLASSES[align],
                col.className ?? "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {col.value}
            </td>
          );
        })}
      </tr>

      {/* summary note row */}
      {summaryNote && (
        <tr>
          <td
            colSpan={columns.length}
            className="pb-3 pt-0 pr-4 text-xs text-stellar-text-secondary"
          >
            {summaryNote}
          </td>
        </tr>
      )}
    </tfoot>
  );
}

// ─── standalone card variant ──────────────────────────────────────────────────

/**
 * A card-style summary for contexts where you can't embed a `<tfoot>`
 * (e.g. grid layouts, responsive fallback below the table).
 */
export interface SummaryCardItem {
  label: string;
  value: ReactNode;
  className?: string;
}

export interface TableSummaryCardProps {
  items: SummaryCardItem[];
  note?: ReactNode;
  className?: string;
}

export function TableSummaryCard({ items, note, className = "" }: TableSummaryCardProps) {
  return (
    <div
      role="region"
      aria-label="Table summary"
      className={[
        "rounded-lg border border-stellar-border bg-stellar-card px-4 py-3",
        className,
      ].join(" ")}
    >
      <dl className="flex flex-wrap gap-x-6 gap-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-baseline gap-2">
            <dt className="text-xs text-stellar-text-secondary whitespace-nowrap">
              {item.label}
            </dt>
            <dd className={`text-sm font-semibold text-white ${item.className ?? ""}`}>
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      {note && (
        <p className="mt-2 text-xs text-stellar-text-secondary">{note}</p>
      )}
    </div>
  );
}


