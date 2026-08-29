import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAssetInsightsTray, type AssetAlert } from "../../hooks/useAssetInsightsTray";
import type { HealthScore } from "../../types";

interface AssetInsightsTrayProps {
  open: boolean;
  symbol: string | null;
  assetName?: string | null;
  onClose: () => void;
  onAddToWatchlist?: (symbol: string) => void;
}

const FOCUSABLE_SELECTOR =
  'a[href],button,[tabindex]:not([tabindex="-1"])';

const SEVERITY_COLORS: Record<AssetAlert["severity"], string> = {
  critical: "text-red-400 bg-red-500/10 border-red-500/30",
  warning: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
  info: "text-blue-400 bg-blue-500/10 border-blue-500/30",
};

const SEVERITY_DOTS: Record<AssetAlert["severity"], string> = {
  critical: "bg-red-500",
  warning: "bg-yellow-500",
  info: "bg-blue-500",
};

const TREND_LABELS: Record<NonNullable<HealthScore["trend"]>, string> = {
  improving: "Improving",
  stable: "Stable",
  deteriorating: "Deteriorating",
};

const TREND_COLORS: Record<NonNullable<HealthScore["trend"]>, string> = {
  improving: "text-green-400",
  stable: "text-blue-400",
  deteriorating: "text-red-400",
};

const TREND_ARROWS: Record<NonNullable<HealthScore["trend"]>, string> = {
  improving: "↑",
  stable: "→",
  deteriorating: "↓",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-400";
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatVolume(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(2)}K`;
  return `$${v.toFixed(2)}`;
}

function TrendSummaryCard({ health, loading }: { health: HealthScore | null | undefined; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-4 animate-pulse">
        <p className="h-3 w-24 rounded bg-stellar-border/60" />
        <p className="mt-3 h-8 w-16 rounded bg-stellar-border/60" />
      </div>
    );
  }

  if (!health) {
    return (
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
        <p className="text-xs uppercase text-stellar-text-secondary">Trend Summary</p>
        <p className="mt-2 text-sm text-stellar-text-secondary">No health data available.</p>
      </div>
    );
  }

  const { overallScore, trend, factors } = health;

  return (
    <section aria-label="Trend summary" className="rounded-lg border border-stellar-border bg-stellar-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-stellar-text-secondary">
          Trend Summary
        </p>
        {trend ? (
          <span className={`text-xs font-semibold ${TREND_COLORS[trend]}`}>
            {TREND_ARROWS[trend]} {TREND_LABELS[trend]}
          </span>
        ) : null}
      </div>

      <div className="flex items-end gap-3">
        <p className={`text-4xl font-bold ${scoreColor(overallScore)}`}>
          {Math.round(overallScore)}
        </p>
        <p className="mb-1 text-xs text-stellar-text-secondary">/ 100 health score</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {Object.entries(factors).map(([key, value]) => {
          const label = key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (s) => s.toUpperCase());
          return (
            <div key={key} className="flex flex-col gap-1">
              <p className="text-xs text-stellar-text-secondary truncate">{label}</p>
              <div className="h-1.5 rounded-full bg-stellar-border overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    value >= 80 ? "bg-green-500" : value >= 50 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                  role="progressbar"
                  aria-valuenow={value}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={label}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RecentAlertsCard({ alerts, loading }: { alerts: AssetAlert[]; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-4 animate-pulse space-y-3">
        <p className="h-3 w-24 rounded bg-stellar-border/60" />
        {[0, 1, 2].map((i) => (
          <p key={i} className="h-10 rounded bg-stellar-border/40" />
        ))}
      </div>
    );
  }

  return (
    <section aria-label="Recent alerts" className="rounded-lg border border-stellar-border bg-stellar-card p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-stellar-text-secondary">
        Recent Alerts
      </p>

      {alerts.length === 0 ? (
        <p className="text-sm text-stellar-text-secondary">No recent alerts.</p>
      ) : (
        <ul className="space-y-2" role="list">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={`rounded-md border p-3 text-xs ${SEVERITY_COLORS[alert.severity]}`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${SEVERITY_DOTS[alert.severity]}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{alert.message}</p>
                  <p className="mt-1 opacity-70">{formatRelativeTime(alert.createdAt)}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VolumeCard({ volume, loading }: {
  volume: { volume24h: number; volume7d: number; volume30d: number } | null | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-4 animate-pulse">
        <p className="h-3 w-20 rounded bg-stellar-border/60" />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <p key={i} className="h-8 rounded bg-stellar-border/40" />)}
        </div>
      </div>
    );
  }

  if (!volume) return null;

  const periods = [
    { label: "24h", value: volume.volume24h },
    { label: "7d", value: volume.volume7d },
    { label: "30d", value: volume.volume30d },
  ];

  return (
    <section aria-label="Volume overview" className="rounded-lg border border-stellar-border bg-stellar-card p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-stellar-text-secondary">
        Volume
      </p>
      <div className="grid grid-cols-3 gap-2">
        {periods.map(({ label, value }) => (
          <div key={label} className="flex flex-col gap-1">
            <p className="text-xs text-stellar-text-secondary">{label}</p>
            <p className="text-sm font-semibold text-white">{formatVolume(value)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickActionsCard({
  symbol,
  onClose,
  onAddToWatchlist,
}: {
  symbol: string;
  onClose: () => void;
  onAddToWatchlist?: (symbol: string) => void;
}) {
  return (
    <section aria-label="Quick actions" className="rounded-lg border border-stellar-border bg-stellar-card p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-stellar-text-secondary">
        Quick Actions
      </p>
      <div className="flex flex-col gap-2">
        <Link
          to={`/assets/${symbol}`}
          onClick={onClose}
          className="flex items-center justify-between rounded-md border border-stellar-border px-3 py-2 text-sm font-medium text-stellar-text-primary transition-colors hover:border-stellar-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          View full details
          <span aria-hidden="true">→</span>
        </Link>

        {onAddToWatchlist ? (
          <button
            type="button"
            onClick={() => onAddToWatchlist(symbol)}
            className="flex items-center justify-between rounded-md border border-stellar-border px-3 py-2 text-sm font-medium text-stellar-text-primary transition-colors hover:border-stellar-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          >
            Add to watchlist
            <span aria-hidden="true">+</span>
          </button>
        ) : null}

        <Link
          to={`/assets/${symbol}?tab=alerts`}
          onClick={onClose}
          className="flex items-center justify-between rounded-md border border-stellar-border px-3 py-2 text-sm font-medium text-stellar-text-primary transition-colors hover:border-stellar-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          View all alerts
          <span aria-hidden="true">→</span>
        </Link>

        <Link
          to={`/transactions?asset=${symbol}`}
          onClick={onClose}
          className="flex items-center justify-between rounded-md border border-stellar-border px-3 py-2 text-sm font-medium text-stellar-text-primary transition-colors hover:border-stellar-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
        >
          View transactions
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

export default function AssetInsightsTray({
  open,
  symbol,
  assetName,
  onClose,
  onAddToWatchlist,
}: AssetInsightsTrayProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { health, healthLoading, volume, volumeLoading, recentAlerts, alertsLoading } =
    useAssetInsightsTray(open ? symbol : null);

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
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute("disabled"));

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

  if (!open || !symbol) return null;

  const displayName = assetName ?? symbol;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close asset insights tray"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />

      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-insights-tray-title"
        className="absolute right-0 top-0 flex h-full w-full flex-col border-l border-stellar-border bg-stellar-dark shadow-2xl shadow-black/40 sm:w-[26rem] lg:w-[30rem]"
      >
        {/* Header */}
        <div className="border-b border-stellar-border bg-stellar-card/80 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-stellar-text-secondary">
                Asset Insights
              </p>
              <h2
                id="asset-insights-tray-title"
                className="truncate text-xl font-semibold text-white"
              >
                {displayName}
              </h2>
              {displayName !== symbol ? (
                <p className="mt-0.5 text-sm text-stellar-text-secondary">{symbol}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-md px-2 py-1 text-sm text-stellar-text-secondary transition hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              aria-label="Close asset insights"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <TrendSummaryCard health={health} loading={healthLoading} />
          <VolumeCard volume={volume} loading={volumeLoading} />
          <RecentAlertsCard alerts={recentAlerts} loading={alertsLoading} />
          <QuickActionsCard
            symbol={symbol}
            onClose={onClose}
            onAddToWatchlist={onAddToWatchlist}
          />
        </div>
      </aside>
    </div>
  );
}
