/**
 * ReportQuickActions (#496)
 *
 * Action bar for report views with:
 *  – Refresh, Export (CSV/JSON), Share (clipboard link) actions
 *  – Loading feedback per-action
 *  – Grouped layout with keyboard access (focusable, aria-*)
 *  – Mobile-responsive (collapses to icon-only on small screens)
 */

import { useCallback, useRef, useState } from "react";

// ─── types ────────────────────────────────────────────────────────────────────

interface QuickAction {
  id: string;
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
  onClick: () => Promise<void> | void;
  /** Disable when no data is available */
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
}

interface ReportQuickActionsProps {
  /** Called when the user clicks Refresh */
  onRefresh: () => Promise<void> | void;
  /** Called when the user clicks Export CSV; should return the CSV string */
  onExportCsv?: () => string | null;
  /** Called when the user clicks Export JSON; should return the JSON string */
  onExportJson?: () => string | null;
  /** URL to share; defaults to window.location.href */
  shareUrl?: string;
  /** Disable export/share actions (e.g. while data is loading) */
  disabled?: boolean;
  /** Extra CSS classes on the root element */
  className?: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── icons (inline SVG, no extra deps) ────────────────────────────────────────

const RefreshIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 2.5a5.487 5.487 0 00-4.131 1.869l1.204 1.204A.25.25 0 014.896 6H1.25A.25.25 0 011 5.75V2.104a.25.25 0 01.427-.177l1.38 1.38A7.001 7.001 0 0114.95 7.16a.75.75 0 11-1.49.178A5.501 5.501 0 008 2.5zM1.705 8.005a.75.75 0 01.834.656 5.501 5.501 0 009.592 2.97l-1.204-1.204a.25.25 0 01.177-.427h3.646a.25.25 0 01.25.25v3.646a.25.25 0 01-.427.177l-1.38-1.38A7.001 7.001 0 011.05 8.84a.75.75 0 01.656-.834z" />
  </svg>
);

const CsvIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M3.75 1.5a.25.25 0 00-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25V1.75z" />
    <path d="M5.5 8.75a.75.75 0 000 1.5h5a.75.75 0 000-1.5h-5zM5 11.25a.75.75 0 01.75-.75h5a.75.75 0 010 1.5h-5a.75.75 0 01-.75-.75zM5.75 6a.75.75 0 000 1.5h1.5a.75.75 0 000-1.5h-1.5z" />
  </svg>
);

const JsonIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M4.553 3.232a.75.75 0 01-.035 1.06l-2.183 2.083 2.183 2.083a.75.75 0 11-1.024 1.097L.784 7.25a.75.75 0 010-1.097L3.494 3.94a.75.75 0 011.06.293zM11.447 3.232a.75.75 0 011.06-.292l2.71 2.61a.75.75 0 010 1.097l-2.71 2.605a.75.75 0 01-1.024-1.097l2.183-2.083-2.183-2.083a.75.75 0 01-.036-1.06zM8.535 1.5a.75.75 0 01.536.898l-3 11a.75.75 0 01-1.434-.434l3-11a.75.75 0 01.898-.464z" />
  </svg>
);

const ShareIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M7.776 3.537a.75.75 0 01.748 0l3.25 1.875A.75.75 0 0112 6.125v3.75a.75.75 0 01-.373.648l-3.25 1.875a.75.75 0 01-.748 0l-3.25-1.875A.75.75 0 014 9.875v-3.75a.75.75 0 01.373-.648l3.403-1.965zM8 4.909L5.5 6.338v3.324L8 11.091l2.5-1.429V6.338L8 4.909z" />
  </svg>
);

const CheckIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
  </svg>
);

// ─── action button ────────────────────────────────────────────────────────────

function ActionButton({
  action,
  loading,
  succeeded,
}: {
  action: QuickAction;
  loading: boolean;
  succeeded: boolean;
}) {
  const baseClass =
    "group relative inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue disabled:cursor-not-allowed disabled:opacity-40";

  const variantClass =
    action.variant === "primary"
      ? "border-stellar-blue bg-stellar-blue/15 text-stellar-blue hover:bg-stellar-blue hover:text-white"
      : action.variant === "danger"
        ? "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
        : "border-stellar-border bg-stellar-card text-stellar-text-secondary hover:text-white";

  return (
    <button
      id={`report-action-${action.id}`}
      type="button"
      onClick={() => void action.onClick()}
      disabled={action.disabled || loading}
      aria-label={action.label}
      aria-busy={loading}
      className={`${baseClass} ${variantClass}`}
    >
      {/* icon */}
      <span className={`shrink-0 transition-transform ${loading ? "animate-spin" : ""}`}>
        {succeeded ? CheckIcon : action.icon}
      </span>

      {/* labels */}
      <span className="hidden sm:inline">{action.shortLabel ?? action.label}</span>

      {/* loading overlay text */}
      {loading && (
        <span className="sr-only" aria-live="polite">
          {action.label} in progress…
        </span>
      )}
      {succeeded && (
        <span className="sr-only" aria-live="polite">
          {action.label} completed.
        </span>
      )}
    </button>
  );
}

// ─── main export ──────────────────────────────────────────────────────────────

export default function ReportQuickActions({
  onRefresh,
  onExportCsv,
  onExportJson,
  shareUrl,
  disabled = false,
  className = "",
}: ReportQuickActionsProps) {
  // Per-action loading/success state
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [succeeded, setSucceeded] = useState<Record<string, boolean>>({});
  const successTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const withFeedback = useCallback(
    async (id: string, fn: () => Promise<void> | void) => {
      setLoading((p) => ({ ...p, [id]: true }));
      try {
        await fn();
        setSucceeded((p) => ({ ...p, [id]: true }));
        // Clear success tick after 2 s
        successTimers.current[id] = setTimeout(() => {
          setSucceeded((p) => ({ ...p, [id]: false }));
        }, 2000);
      } finally {
        setLoading((p) => ({ ...p, [id]: false }));
      }
    },
    []
  );

  const slug = () =>
    new Date().toISOString().slice(0, 10);

  const actions: QuickAction[] = [
    {
      id: "refresh",
      label: "Refresh data",
      shortLabel: "Refresh",
      icon: RefreshIcon,
      onClick: () => withFeedback("refresh", onRefresh),
      variant: "primary",
    },
    ...(onExportCsv
      ? [
          {
            id: "export-csv",
            label: "Export as CSV",
            shortLabel: "CSV",
            icon: CsvIcon,
            disabled,
            onClick: () =>
              withFeedback("export-csv", () => {
                const csv = onExportCsv();
                if (csv) downloadBlob(csv, `report-${slug()}.csv`, "text/csv");
              }),
          },
        ]
      : []),
    ...(onExportJson
      ? [
          {
            id: "export-json",
            label: "Export as JSON",
            shortLabel: "JSON",
            icon: JsonIcon,
            disabled,
            onClick: () =>
              withFeedback("export-json", () => {
                const json = onExportJson();
                if (json)
                  downloadBlob(json, `report-${slug()}.json`, "application/json");
              }),
          },
        ]
      : []),
    {
      id: "share",
      label: "Copy link to clipboard",
      shortLabel: "Share",
      icon: ShareIcon,
      disabled,
      onClick: () =>
        withFeedback("share", async () => {
          await navigator.clipboard.writeText(shareUrl ?? window.location.href);
        }),
    },
  ];

  return (
    <div
      role="toolbar"
      aria-label="Report quick actions"
      className={`flex flex-wrap items-center gap-2 ${className}`}
    >
      {actions.map((action) => (
        <ActionButton
          key={action.id}
          action={action}
          loading={loading[action.id] ?? false}
          succeeded={succeeded[action.id] ?? false}
        />
      ))}
    </div>
  );
}
