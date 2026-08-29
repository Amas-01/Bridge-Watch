import React, { useState } from "react";

interface AllowlistEntry {
  id: string;
  webhookEndpointId?: string;
  ipOrCidr: string;
  description?: string;
  direction: "inbound" | "outbound" | "both";
  isActive: boolean;
  createdBy?: string;
  createdAt: string;
}

export default function WebhookIpAllowlist() {
  const [entries, setEntries] = useState<AllowlistEntry[]>([
    {
      id: "wl-1",
      ipOrCidr: "192.168.1.0/24",
      description: "Internal cluster subnet for inbound hooks",
      direction: "inbound",
      isActive: true,
      createdBy: "admin",
      createdAt: new Date().toISOString(),
    },
    {
      id: "wl-2",
      ipOrCidr: "10.0.4.50",
      description: "Partner node webhook receiver",
      direction: "outbound",
      isActive: true,
      createdBy: "op-lead",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newIpCidr, setNewIpCidr] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newDirection, setNewDirection] = useState<"inbound" | "outbound" | "both">("inbound");

  // Test Simulator state
  const [testIp, setTestIp] = useState("");
  const [testResult, setTestResult] = useState<{ allowed: boolean; reason: string } | null>(null);

  const handleAddEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIpCidr.trim()) return;

    const created: AllowlistEntry = {
      id: `wl-${Date.now()}`,
      ipOrCidr: newIpCidr.trim(),
      description: newDescription.trim(),
      direction: newDirection,
      isActive: true,
      createdBy: "admin",
      createdAt: new Date().toISOString(),
    };

    setEntries([created, ...entries]);
    setNewIpCidr("");
    setNewDescription("");
    setNewDirection("inbound");
    setShowAddModal(false);
  };

  const handleToggleStatus = (id: string) => {
    setEntries((prev) =>
      prev.map((item) => (item.id === id ? { ...item, isActive: !item.isActive } : item))
    );
  };

  const handleDelete = (id: string) => {
    setEntries((prev) => prev.filter((item) => item.id !== id));
  };

  const runTest = () => {
    if (!testIp.trim()) return;
    const ip = testIp.trim();

    // Simple test simulator logic matching entries
    const activeEntries = entries.filter((e) => e.isActive);
    if (activeEntries.length === 0) {
      setTestResult({ allowed: true, reason: "No active allowlist rules exist (Default Allow)" });
      return;
    }

    const matched = activeEntries.find(
      (e) => e.ipOrCidr === ip || e.ipOrCidr === "0.0.0.0/0" || ip.startsWith(e.ipOrCidr.split("/")[0].slice(0, 7))
    );

    if (matched) {
      setTestResult({ allowed: true, reason: `Matched rule: ${matched.ipOrCidr} (${matched.direction})` });
    } else {
      setTestResult({ allowed: false, reason: `IP ${ip} is blocked by current active rules` });
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Webhook IP Allowlist Management</h1>
          <p className="text-sm text-stellar-text-secondary">
            Manage IP and CIDR subnet access controls for inbound webhooks and outbound delivery receivers.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white hover:bg-stellar-blue/80 transition"
        >
          + Add Allowlist Entry
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
          <div className="text-xs font-medium text-stellar-text-secondary">Active Rules</div>
          <div className="mt-2 text-2xl font-semibold text-green-400">
            {entries.filter((e) => e.isActive).length}
          </div>
        </div>
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
          <div className="text-xs font-medium text-stellar-text-secondary">Inbound Subnets</div>
          <div className="mt-2 text-2xl font-semibold text-blue-400">
            {entries.filter((e) => e.direction === "inbound" || e.direction === "both").length}
          </div>
        </div>
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
          <div className="text-xs font-medium text-stellar-text-secondary">Outbound Subnets</div>
          <div className="mt-2 text-2xl font-semibold text-purple-400">
            {entries.filter((e) => e.direction === "outbound" || e.direction === "both").length}
          </div>
        </div>
      </div>

      {/* Test IP Simulator Sandbox */}
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white">Interactive IP Access Simulator</h3>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Enter test IP (e.g. 192.168.1.100)"
            value={testIp}
            onChange={(e) => setTestIp(e.target.value)}
            className="flex-1 min-w-[240px] rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-stellar-blue"
          />
          <button
            onClick={runTest}
            className="rounded bg-stellar-dark border border-stellar-border px-4 py-1.5 text-sm font-medium text-white hover:bg-stellar-border transition"
          >
            Evaluate Access
          </button>
        </div>
        {testResult && (
          <div
            className={`mt-2 rounded p-3 text-xs font-mono border ${
              testResult.allowed
                ? "bg-green-500/10 text-green-400 border-green-500/30"
                : "bg-red-500/10 text-red-400 border-red-500/30"
            }`}
          >
            Status: {testResult.allowed ? "ALLOWED [PASS]" : "DENIED [BLOCKED]"} — {testResult.reason}
          </div>
        )}
      </div>

      {/* Allowlist Table */}
      <div className="overflow-x-auto rounded-lg border border-stellar-border bg-stellar-card">
        <table className="w-full text-left text-sm text-white">
          <thead className="border-b border-stellar-border bg-stellar-dark text-xs uppercase text-stellar-text-secondary">
            <tr>
              <th className="px-4 py-3">IP / CIDR Range</th>
              <th className="px-4 py-3">Direction</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created By</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stellar-border">
            {entries.map((entry) => (
              <tr key={entry.id} className="hover:bg-stellar-dark/50 transition">
                <td className="px-4 py-3 font-mono font-semibold text-white">{entry.ipOrCidr}</td>
                <td className="px-4 py-3 capitalize text-xs">
                  <span className="rounded bg-stellar-dark border border-stellar-border px-2 py-0.5 text-stellar-text-secondary">
                    {entry.direction}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-stellar-text-secondary">{entry.description || "N/A"}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleStatus(entry.id)}
                    className={`rounded px-2 py-0.5 text-xs font-semibold ${
                      entry.isActive
                        ? "bg-green-500/20 text-green-400"
                        : "bg-gray-500/20 text-gray-400"
                    }`}
                  >
                    {entry.isActive ? "Active" : "Disabled"}
                  </button>
                </td>
                <td className="px-4 py-3 text-xs text-stellar-text-secondary">{entry.createdBy}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  <button
                    onClick={() => handleDelete(entry.id)}
                    className="rounded bg-red-500/20 text-red-400 px-2 py-1 text-xs hover:bg-red-500/30"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Entry Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleAddEntry} className="w-full max-w-md rounded-lg border border-stellar-border bg-stellar-card p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white">Add Webhook IP Allowlist Entry</h3>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">IP Address or CIDR Range</label>
              <input
                type="text"
                required
                placeholder="e.g. 192.168.1.0/24 or 10.0.0.5"
                value={newIpCidr}
                onChange={(e) => setNewIpCidr(e.target.value)}
                className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Direction</label>
              <select
                value={newDirection}
                onChange={(e) => setNewDirection(e.target.value as any)}
                className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white"
              >
                <option value="inbound">Inbound (Incoming webhooks)</option>
                <option value="outbound">Outbound (Destination delivery)</option>
                <option value="both">Both (Inbound & Outbound)</option>
              </select>
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
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-stellar-blue px-4 py-2 text-sm text-white hover:bg-stellar-blue/80"
              >
                Add Rule
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
