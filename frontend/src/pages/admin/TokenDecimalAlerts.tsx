import { useState, useEffect } from "react";

interface Alert {
  id: string;
  tokenAddress: string;
  previousDecimals: number;
  newDecimals: number;
  detectedAt: string;
  alertStatus: "open" | "acknowledged" | "resolved";
  acknowledgedBy: string | null;
  resolvedAt: string | null;
}

export default function TokenDecimalAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusFilter, setStatusFilter] = useState<"open" | "acknowledged" | "resolved">("open");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAlerts();
  }, [statusFilter]);

  const loadAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/admin/token-decimal-alerts?status=${statusFilter}`
      );
      if (!response.ok) throw new Error("Failed to load alerts");
      const data = await response.json();
      setAlerts(data.alerts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/token-decimal-alerts/${id}/acknowledge`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to acknowledge alert");
      await loadAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/token-decimal-alerts/${id}/resolve`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Failed to resolve alert");
      await loadAlerts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-red-500/15 text-red-300 border-red-500/40";
      case "acknowledged":
        return "bg-yellow-500/15 text-yellow-300 border-yellow-500/40";
      case "resolved":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
      default:
        return "bg-gray-500/15 text-gray-300 border-gray-500/40";
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Token Decimal Change Alerts</h1>
        <p className="mt-2 max-w-2xl text-stellar-text-secondary">
          Monitor and manage alerts for token decimal changes detected on-chain.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Status Filter */}
      <div className="flex gap-4">
        {(["open", "acknowledged", "resolved"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              statusFilter === status
                ? "bg-stellar-blue text-white"
                : "border border-stellar-border text-stellar-text-secondary hover:text-white"
            }`}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </button>
        ))}
      </div>

      {/* Alerts List */}
      {loading && alerts.length === 0 ? (
        <div className="text-center text-stellar-text-secondary">Loading...</div>
      ) : alerts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
          No {statusFilter} alerts found.
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <article
              key={alert.id}
              className={`rounded-3xl border p-6 ${getSeverityColor(alert.alertStatus)}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase">
                      {alert.alertStatus}
                    </span>
                    <span className="text-xs text-white/70">
                      Detected {new Date(alert.detectedAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-3 font-mono text-sm text-white">{alert.tokenAddress}</p>
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-white/60">Previous:</span>
                      <span className="ml-2 font-semibold text-white">
                        {alert.previousDecimals} decimals
                      </span>
                    </div>
                    <span className="text-white/40">→</span>
                    <div>
                      <span className="text-white/60">New:</span>
                      <span className="ml-2 font-semibold text-white">
                        {alert.newDecimals} decimals
                      </span>
                    </div>
                  </div>
                  {alert.acknowledgedBy && (
                    <p className="mt-2 text-xs text-white/60">
                      Acknowledged by {alert.acknowledgedBy}
                    </p>
                  )}
                  {alert.resolvedAt && (
                    <p className="mt-1 text-xs text-white/60">
                      Resolved at {new Date(alert.resolvedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {alert.alertStatus === "open" && (
                    <button
                      onClick={() => void handleAcknowledge(alert.id)}
                      disabled={loading}
                      className="rounded-full border border-white/20 px-4 py-2 text-sm text-white transition hover:bg-white/10 disabled:opacity-50"
                    >
                      Acknowledge
                    </button>
                  )}
                  {(alert.alertStatus === "open" || alert.alertStatus === "acknowledged") && (
                    <button
                      onClick={() => void handleResolve(alert.id)}
                      disabled={loading}
                      className="rounded-full bg-white/20 px-4 py-2 text-sm text-white transition hover:bg-white/30 disabled:opacity-50"
                    >
                      Resolve
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
