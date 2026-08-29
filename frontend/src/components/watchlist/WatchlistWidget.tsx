import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useWatchlist } from "../../hooks/useWatchlist";
import { useWebSocket } from "../../hooks/useWebSocket";
import AlertSnoozeControls from "../alerts/AlertSnoozeControls";
import { useAlertSnoozes } from "../../hooks/useAlertSnoozes";
import { CollapsibleWidget } from "../dashboard/CollapsibleWidget";

interface WatchlistWsAlert {
  symbol: string;
  message: string;
  severity?: "info" | "warning" | "error";
  timestamp?: string;
}

function asAssetAlert(value: unknown): WatchlistWsAlert | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const payload = value as Record<string, unknown>;
  if (typeof payload.symbol !== "string" || typeof payload.message !== "string") {
    return null;
  }

  return {
    symbol: payload.symbol.toUpperCase(),
    message: payload.message,
    severity:
      payload.severity === "warning" || payload.severity === "error"
        ? payload.severity
        : "info",
    timestamp: typeof payload.timestamp === "string" ? payload.timestamp : undefined,
  };
}

export default function WatchlistWidget() {
  const { activeWatchlist, activeSymbols } = useWatchlist();
  const [alerts, setAlerts] = useState<WatchlistWsAlert[]>([]);
  const { snooze, unsnooze, getStatus, snoozeMany } = useAlertSnoozes();

  const symbolsSet = useMemo(() => new Set(activeSymbols), [activeSymbols]);
  const visibleAlerts = alerts.filter((alert) => !getStatus(`${alert.symbol}:${alert.message}`));

  const onAlert = useCallback(
    (raw: unknown) => {
      const alert = asAssetAlert(raw);
      if (!alert || !symbolsSet.has(alert.symbol)) {
        return;
      }

      setAlerts((previous) => [alert, ...previous].slice(0, 5));
    },
    [symbolsSet]
  );

  useWebSocket("alerts", onAlert);

  const headerActions = (
    <Link to="/watchlists" className="text-sm text-stellar-blue hover:underline">
      Manage
    </Link>
  );

  return (
    <CollapsibleWidget
      id="watchlist"
      title="Watchlist quick access"
      headerActions={headerActions}
      defaultCollapsed={false}
      headerClassName="text-lg font-semibold text-white"
    >
      <p className="mb-3 text-xs text-stellar-text-secondary">
        Active list: {activeWatchlist?.name ?? "None"}
      </p>

      {activeSymbols.length === 0 ? (
        <p className="text-sm text-stellar-text-secondary">Add assets to track focused updates.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {activeSymbols.slice(0, 8).map((symbol) => (
            <Link
              key={symbol}
              to={`/assets/${symbol}`}
              className="rounded border border-stellar-border px-3 py-1 text-xs text-white hover:bg-stellar-dark"
            >
              {symbol}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-white">Watchlist alerts</h3>
          {visibleAlerts.length > 0 ? (
            <AlertSnoozeControls
              label="all watchlist alerts"
              compact
              snoozedUntil={null}
              onSnooze={(durationMinutes) =>
                snoozeMany(
                  visibleAlerts.map((alert) => ({
                    key: `${alert.symbol}:${alert.message}`,
                    label: alert.message,
                  })),
                  durationMinutes
                )
              }
            />
          ) : null}
        </div>
        {alerts.length === 0 ? (
          <p className="text-xs text-stellar-text-secondary">No focused alerts yet.</p>
        ) : (
          <ul className="space-y-2 text-xs">
            {alerts.map((alert, index) => {
              const snoozeKey = `${alert.symbol}:${alert.message}`;
              const status = getStatus(snoozeKey);

              return (
                <li key={`${alert.symbol}-${index}`} className="rounded border border-stellar-border p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-white">{alert.symbol}</span>
                    <span
                      className={
                        alert.severity === "error"
                          ? "text-red-300"
                          : alert.severity === "warning"
                            ? "text-yellow-300"
                            : "text-stellar-text-secondary"
                      }
                    >
                      {alert.severity?.toUpperCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-stellar-text-secondary">{alert.message}</p>
                  {status ? (
                    <p className="mt-1 text-[11px] text-stellar-blue">
                      Snoozed until {new Date(status.snoozedUntil).toLocaleTimeString()}
                    </p>
                  ) : null}
                  <div className="mt-2">
                    <AlertSnoozeControls
                      label={`${alert.symbol} alert`}
                      snoozedUntil={status?.snoozedUntil ?? null}
                      onSnooze={(durationMinutes) => snooze(snoozeKey, alert.message, durationMinutes)}
                      onUnsnooze={status ? () => unsnooze(snoozeKey) : undefined}
                      compact
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </CollapsibleWidget>
  );
}
