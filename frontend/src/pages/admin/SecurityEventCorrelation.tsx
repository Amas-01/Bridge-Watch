import React, { useEffect, useState } from "react";

interface CorrelationView {
  id: string;
  title: string;
  description?: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "active" | "investigating" | "resolved" | "archived";
  eventCount: number;
  sourceSystems: string[];
  timeWindowMinutes: number;
  createdBy?: string;
  createdAt: string;
}

interface SecurityEvent {
  id: string;
  eventType: string;
  source: string;
  severity: "low" | "medium" | "high" | "critical";
  actor?: string;
  ipAddress?: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export default function SecurityEventCorrelation() {
  const [correlations, setCorrelations] = useState<CorrelationView[]>([
    {
      id: "sec-c1",
      title: "Multiple Failed Webhook & Auth Signatures",
      description: "Correlated spikes in invalid HMAC request signatures and rate-limit hits",
      severity: "high",
      status: "investigating",
      eventCount: 42,
      sourceSystems: ["webhook-gateway", "api-auth-middleware"],
      timeWindowMinutes: 30,
      createdBy: "sec-admin",
      createdAt: new Date().toISOString(),
    },
    {
      id: "sec-c2",
      title: "Sensitive Field Bulk Export Anomaly",
      description: "Abnormal access count on private keys and user secret tokens",
      severity: "critical",
      status: "active",
      eventCount: 18,
      sourceSystems: ["audit-logger", "compliance-engine"],
      timeWindowMinutes: 60,
      createdBy: "compliance-bot",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
  ]);

  const [selectedCorrelation, setSelectedCorrelation] = useState<CorrelationView | null>(null);
  const [rawEvents, setRawEvents] = useState<SecurityEvent[]>([
    {
      id: "ev-1",
      eventType: "invalid_signature",
      source: "api-auth-middleware",
      severity: "high",
      actor: "192.168.1.105",
      ipAddress: "192.168.1.105",
      details: { path: "/api/v1/admin/keys", reason: "HMAC digest mismatch" },
      timestamp: new Date().toISOString(),
    },
    {
      id: "ev-2",
      eventType: "rate_limit_exceeded",
      source: "webhook-gateway",
      severity: "medium",
      actor: "service-outbox",
      ipAddress: "10.0.4.12",
      details: { limit: 120, current: 145 },
      timestamp: new Date(Date.now() - 600000).toISOString(),
    },
  ]);

  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newSeverity, setNewSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");

  const filteredCorrelations = correlations.filter((item) => {
    if (filterSeverity && item.severity !== filterSeverity) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    if (
      searchTerm &&
      !item.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !(item.description || "").toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const handleStatusChange = (id: string, newStatus: CorrelationView["status"]) => {
    setCorrelations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const created: CorrelationView = {
      id: `sec-${Date.now()}`,
      title: newTitle.trim(),
      description: newDescription.trim(),
      severity: newSeverity,
      status: "active",
      eventCount: 0,
      sourceSystems: ["custom-rule"],
      timeWindowMinutes: 60,
      createdBy: "operator",
      createdAt: new Date().toISOString(),
    };

    setCorrelations([created, ...correlations]);
    setNewTitle("");
    setNewDescription("");
    setNewSeverity("medium");
    setShowCreateModal(false);
  };

  const getSeverityBadgeClass = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500/20 text-red-400 border-red-500/30";
      case "high":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "medium":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
      default:
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "active":
        return "bg-red-500/20 text-red-300";
      case "investigating":
        return "bg-yellow-500/20 text-yellow-300";
      case "resolved":
        return "bg-green-500/20 text-green-300";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Security Event Correlation</h1>
          <p className="text-sm text-stellar-text-secondary">
            Correlate security anomalies, auth events, and access logs into operational alert views.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white hover:bg-stellar-blue/80 transition"
        >
          + Create Correlation View
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
          <div className="text-xs font-medium text-stellar-text-secondary">Total Correlation Views</div>
          <div className="mt-2 text-2xl font-semibold text-white">{correlations.length}</div>
        </div>
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
          <div className="text-xs font-medium text-stellar-text-secondary">Active Investigations</div>
          <div className="mt-2 text-2xl font-semibold text-yellow-400">
            {correlations.filter((c) => c.status === "investigating" || c.status === "active").length}
          </div>
        </div>
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
          <div className="text-xs font-medium text-stellar-text-secondary">Critical / High Alerts</div>
          <div className="mt-2 text-2xl font-semibold text-red-400">
            {correlations.filter((c) => c.severity === "critical" || c.severity === "high").length}
          </div>
        </div>
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
          <div className="text-xs font-medium text-stellar-text-secondary">Total Correlated Events</div>
          <div className="mt-2 text-2xl font-semibold text-blue-400">
            {correlations.reduce((acc, curr) => acc + curr.eventCount, 0)}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-stellar-border bg-stellar-card p-4">
        <input
          type="text"
          placeholder="Search correlation views..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-stellar-blue"
        />
        <select
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
          className="rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-stellar-blue"
        >
          <option value="">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-md border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-stellar-blue"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="investigating">Investigating</option>
          <option value="resolved">Resolved</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-stellar-border bg-stellar-card">
        <table className="w-full text-left text-sm text-white">
          <thead className="border-b border-stellar-border bg-stellar-dark text-xs uppercase text-stellar-text-secondary">
            <tr>
              <th className="px-4 py-3">Title & Description</th>
              <th className="px-4 py-3">Severity</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Events</th>
              <th className="px-4 py-3">Sources</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stellar-border">
            {filteredCorrelations.map((c) => (
              <tr key={c.id} className="hover:bg-stellar-dark/50 transition">
                <td className="px-4 py-3">
                  <div className="font-semibold text-white">{c.title}</div>
                  <div className="text-xs text-stellar-text-secondary">{c.description}</div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${getSeverityBadgeClass(
                      c.severity
                    )}`}
                  >
                    {c.severity}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadgeClass(
                      c.status
                    )}`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-sm">{c.eventCount}</td>
                <td className="px-4 py-3 text-xs text-stellar-text-secondary">
                  {c.sourceSystems.join(", ")}
                </td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => setSelectedCorrelation(c)}
                    className="rounded bg-stellar-dark border border-stellar-border px-2 py-1 text-xs text-stellar-text-secondary hover:text-white"
                  >
                    View Drilldown
                  </button>
                  <select
                    value={c.status}
                    onChange={(e) => handleStatusChange(c.id, e.target.value as any)}
                    className="rounded border border-stellar-border bg-stellar-dark px-2 py-1 text-xs text-white"
                  >
                    <option value="active">Active</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                    <option value="archived">Archived</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Drilldown Drawer / Modal */}
      {selectedCorrelation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-stellar-border bg-stellar-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-stellar-border pb-3">
              <h3 className="text-lg font-bold text-white">{selectedCorrelation.title}</h3>
              <button
                onClick={() => setSelectedCorrelation(null)}
                className="text-stellar-text-secondary hover:text-white"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-stellar-text-secondary">
              <p>{selectedCorrelation.description}</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Severity: <span className="text-white capitalize">{selectedCorrelation.severity}</span></div>
                <div>Status: <span className="text-white capitalize">{selectedCorrelation.status}</span></div>
                <div>Time Window: <span className="text-white">{selectedCorrelation.timeWindowMinutes} minutes</span></div>
                <div>Created By: <span className="text-white">{selectedCorrelation.createdBy}</span></div>
              </div>
              <h4 className="mt-4 font-semibold text-white">Associated Security Events</h4>
              <div className="max-h-60 overflow-y-auto rounded border border-stellar-border bg-stellar-dark p-3 space-y-2 text-xs">
                {rawEvents.map((ev) => (
                  <div key={ev.id} className="border-b border-stellar-border/40 pb-2">
                    <div className="flex justify-between font-mono text-white">
                      <span>{ev.eventType} ({ev.source})</span>
                      <span className="text-stellar-text-secondary">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="text-stellar-text-secondary">Actor: {ev.actor || "N/A"} | IP: {ev.ipAddress || "N/A"}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-6 text-right">
              <button
                onClick={() => setSelectedCorrelation(null)}
                className="rounded bg-stellar-blue px-4 py-2 text-sm text-white hover:bg-stellar-blue/80"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleCreate} className="w-full max-w-md rounded-lg border border-stellar-border bg-stellar-card p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white">Create Security Correlation View</h3>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Title</label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Description</label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Severity</label>
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as any)}
                className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="rounded border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-stellar-blue px-4 py-2 text-sm text-white hover:bg-stellar-blue/80"
              >
                Save Correlation View
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
