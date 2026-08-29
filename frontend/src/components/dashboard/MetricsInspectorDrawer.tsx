import { useEffect, useRef } from "react";

export interface MetricInspectorMetadata {
  id: string;
  label: string;
  definition: string;
  source: string;
  context: string;
  refresh: string;
}

interface MetricsInspectorDrawerProps {
  open: boolean;
  metric: MetricInspectorMetadata | null;
  onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

export default function MetricsInspectorDrawer({
  open,
  metric,
  onClose,
}: MetricsInspectorDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timeout = window.setTimeout(() => {
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
      window.clearTimeout(timeout);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, open]);

  if (!open || !metric) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close metrics inspector"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metrics-inspector-title"
        className="absolute right-0 top-0 flex h-full w-full flex-col border-l border-stellar-border bg-stellar-dark shadow-2xl shadow-black/40 sm:w-[28rem] lg:w-[34rem]"
      >
        <div className="border-b border-stellar-border bg-stellar-card/80 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase text-stellar-text-secondary">Metric inspector</p>
              <h2 id="metrics-inspector-title" className="text-xl font-semibold text-white">
                {metric.label}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="min-h-10 rounded-md px-3 text-sm text-stellar-text-secondary hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
              aria-label="Close metrics inspector"
            >
              x
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <section className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <h3 className="text-sm font-semibold text-white">Definition</h3>
            <p className="mt-2 text-sm leading-6 text-stellar-text-secondary">
              {metric.definition}
            </p>
          </section>

          <section className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <h3 className="text-sm font-semibold text-white">Source</h3>
            <p className="mt-2 text-sm leading-6 text-stellar-text-secondary">{metric.source}</p>
          </section>

          <section className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <h3 className="text-sm font-semibold text-white">Current context</h3>
            <p className="mt-2 text-sm leading-6 text-stellar-text-secondary">{metric.context}</p>
          </section>

          <section className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <h3 className="text-sm font-semibold text-white">Refresh cadence</h3>
            <p className="mt-2 text-sm leading-6 text-stellar-text-secondary">{metric.refresh}</p>
          </section>
        </div>
      </aside>
    </div>
  );
}
