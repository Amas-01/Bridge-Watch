import { useEffect, useRef } from "react";

export interface DrilldownMetric {
  label: string;
  value: string | number;
  detail?: string;
}

export interface DrilldownContext {
  id: string;
  title: string;
  subtitle?: string;
  metrics: DrilldownMetric[];
  rows?: Array<{ label: string; value: string | number; status?: string }>;
}

interface DrilldownDrawerProps {
  open: boolean;
  context: DrilldownContext | null;
  onClose: () => void;
  onBack?: () => void;
}

const FOCUSABLE_SELECTOR =
  'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

export default function DrilldownDrawer({
  open,
  context,
  onClose,
  onBack,
}: DrilldownDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => !element.hasAttribute("disabled"));

      if (!focusable.length) return;

      const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (currentIndex === -1) return;

      event.preventDefault();
      const nextIndex = event.shiftKey
        ? (currentIndex - 1 + focusable.length) % focusable.length
        : (currentIndex + 1) % focusable.length;
      focusable[nextIndex]?.focus();
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open || !context) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close drilldown drawer"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drilldown-drawer-title"
        className="absolute right-0 top-0 flex h-full w-full flex-col border-l border-stellar-border bg-stellar-dark shadow-2xl shadow-black/40 sm:w-[28rem] lg:w-[34rem]"
      >
        <div className="border-b border-stellar-border bg-stellar-card/80 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-stellar-text-secondary">Drilldown</p>
              <h2 id="drilldown-drawer-title" className="text-xl font-semibold text-white">
                {context.title}
              </h2>
              {context.subtitle ? (
                <p className="mt-1 text-sm text-stellar-text-secondary">{context.subtitle}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-2 py-1 text-sm text-stellar-text-secondary hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              aria-label="Close drilldown"
            >
              x
            </button>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={onBack ?? onClose}
              className="rounded-md border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-primary hover:border-stellar-blue focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            >
              Back
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {context.metrics.map((metric) => (
              <div
                key={metric.label}
                className="rounded-lg border border-stellar-border bg-stellar-card p-4"
              >
                <p className="text-xs uppercase text-stellar-text-secondary">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
                {metric.detail ? (
                  <p className="mt-1 text-xs text-stellar-text-secondary">{metric.detail}</p>
                ) : null}
              </div>
            ))}
          </div>

          {context.rows?.length ? (
            <div className="rounded-lg border border-stellar-border bg-stellar-card">
              <div className="border-b border-stellar-border px-4 py-3">
                <h3 className="text-sm font-semibold text-white">Details</h3>
              </div>
              <div className="divide-y divide-stellar-border">
                {context.rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">{row.label}</p>
                      {row.status ? (
                        <p className="text-xs text-stellar-text-secondary">{row.status}</p>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold text-stellar-text-primary">{row.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
