import React from "react";
import { useWidgetCollapse } from "../../hooks/useWidgetCollapse";

interface CollapsibleWidgetProps {
  id: string;
  title: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  "data-testid"?: string;
  "aria-labelledby"?: string;
}

export function CollapsibleWidget({
  id,
  title,
  defaultCollapsed = false,
  children,
  headerActions,
  className = "rounded-lg border border-stellar-border bg-stellar-card p-6",
  headerClassName = "text-xl font-semibold text-white",
  "data-testid": dataTestId,
  "aria-labelledby": ariaLabelledBy,
}: CollapsibleWidgetProps) {
  const { isCollapsed, toggleCollapse } = useWidgetCollapse(id, defaultCollapsed);

  const headingId = ariaLabelledBy ?? `widget-heading-${id}`;

  return (
    <section className={className} aria-labelledby={headingId} data-testid={dataTestId}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleCollapse}
            aria-expanded={!isCollapsed}
            aria-controls={`widget-content-${id}`}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-stellar-border focus:outline-none focus:ring-2 focus:ring-stellar-blue transition-colors group"
            title={isCollapsed ? "Expand widget" : "Collapse widget"}
            aria-label={isCollapsed ? `Expand ${title}` : `Collapse ${title}`}
          >
            <svg
              className={`h-4 w-4 text-stellar-text-secondary group-hover:text-white transition-transform duration-200 ${
                isCollapsed ? "-rotate-90" : "rotate-0"
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <h2 id={headingId} className={headerClassName}>
            {title}
          </h2>
        </div>
        {headerActions}
      </div>

      <div
        id={`widget-content-${id}`}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
          isCollapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden">
          <div className="pt-4">
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
