type PullToRefreshProps = {
  isPulling: boolean;
  pullDistance: number;
  progress: number;
  isRefreshing: boolean;
};

export default function PullToRefresh({
  isPulling,
  pullDistance,
  progress,
  isRefreshing,
}: PullToRefreshProps) {
  const visible = isPulling || isRefreshing;
  const label = isRefreshing
    ? "Refreshing data"
    : progress >= 1
      ? "Release to refresh"
      : "Pull down to refresh";

  return (
    <div
      className={`pointer-events-none sticky top-0 z-20 -mt-2 flex justify-center transition-all duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      aria-live="polite"
      aria-hidden={!visible}
    >
      <div
        className="mt-2 inline-flex items-center gap-3 rounded-full border border-stellar-border bg-stellar-card/95 px-4 py-2 text-xs text-white shadow-lg backdrop-blur"
        style={{
          transform: visible ? `translateY(${Math.min(pullDistance, 24)}px)` : "translateY(-12px)",
        }}
      >
        <span className={isRefreshing ? "animate-spin" : ""} aria-hidden="true">
          ↻
        </span>
        <span>{label}</span>
        <span className="text-stellar-text-secondary">{Math.round(progress * 100)}%</span>
      </div>
    </div>
  );
}

