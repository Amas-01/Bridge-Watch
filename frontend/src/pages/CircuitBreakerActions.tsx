/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import {
  ShieldExclamationIcon,
  PlayIcon,
  PlusIcon,
  CommandLineIcon,
  GlobeAltIcon,
  LockClosedIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

export interface ActionConfig {
  id: string;
  name: string;
  alert_type: string;
  action_type: "script" | "webhook" | "contract_pause";
  config: string;
  enabled: boolean;
  timeout_ms: number;
  created_at?: string;
}

export interface ActionLog {
  id: string;
  action_config_id: string;
  alert_type: string;
  action_type: "script" | "webhook" | "contract_pause";
  status: "pending" | "success" | "failed";
  output: string | null;
  error_message: string | null;
  execution_time_ms: number;
  executed_at: string;
}

export const CircuitBreakerActions: React.FC = () => {
  const [actions, setActions] = useState<ActionConfig[]>([]);
  const [logs, setLogs] = useState<ActionLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"actions" | "logs">("actions");
  const [selectedLog, setSelectedLog] = useState<ActionLog | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Form state for creating/editing action config
  const [formData, setFormData] = useState({
    id: "",
    name: "",
    alert_type: "price_deviation",
    action_type: "script" as "script" | "webhook" | "contract_pause",
    command: "",
    url: "",
    contractId: "",
    timeout_ms: 30000,
    enabled: true,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [actionsRes, logsRes] = await Promise.all([
        fetch("/api/v1/circuit-breaker/actions").then((r) => (r.ok ? r.json() : { actions: [] })),
        fetch("/api/v1/circuit-breaker/action-logs").then((r) => (r.ok ? r.json() : { logs: [] })),
      ]);
      setActions(actionsRes.actions || []);
      setLogs(logsRes.logs || []);
    } catch (err) {
      console.error("Failed to load circuit breaker remediation data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnable = async (action: ActionConfig) => {
    try {
      const res = await fetch(`/api/v1/circuit-breaker/actions/${action.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !action.enabled }),
      });
      if (res.ok) {
        setActions((prev) =>
          prev.map((item) => (item.id === action.id ? { ...item, enabled: !item.enabled } : item))
        );
      }
    } catch (err) {
      console.error("Failed to toggle action state", err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this remediation action configuration?")) return;
    try {
      const res = await fetch(`/api/v1/circuit-breaker/actions/${id}`, { method: "DELETE" });
      if (res.ok) {
        setActions((prev) => prev.filter((item) => item.id !== id));
      }
    } catch (err) {
      console.error("Failed to delete action config", err);
    }
  };

  const handleTestRun = async (id: string) => {
    setTestingId(id);
    try {
      const res = await fetch(`/api/v1/circuit-breaker/actions/${id}/test`, { method: "POST" });
      const data = await res.json();
      if (data.log) {
        setLogs((prev) => [data.log, ...prev]);
        setSelectedLog(data.log);
      }
    } catch (err) {
      console.error("Test execution failed", err);
    } finally {
      setTestingId(null);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    let configPayload: any = {};
    if (formData.action_type === "script") {
      configPayload = { command: formData.command };
    } else if (formData.action_type === "webhook") {
      configPayload = { url: formData.url, method: "POST" };
    } else if (formData.action_type === "contract_pause") {
      configPayload = { contractId: formData.contractId, scope: "global" };
    }

    const payload = {
      name: formData.name,
      alert_type: formData.alert_type,
      action_type: formData.action_type,
      config: JSON.stringify(configPayload),
      enabled: formData.enabled,
      timeout_ms: formData.timeout_ms,
    };

    try {
      const url = formData.id ? `/api/v1/circuit-breaker/actions/${formData.id}` : "/api/v1/circuit-breaker/actions";
      const method = formData.id ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error("Failed to save action configuration", err);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <ShieldExclamationIcon className="text-amber-500 w-7 h-7" />
            Circuit Breaker Remediation Engine
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Automated remediation script execution, HTTP webhooks, and Soroban contract pause hooks triggered on circuit breaker alerts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors border border-gray-700"
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            onClick={() => {
              setFormData({
                id: "",
                name: "",
                alert_type: "price_deviation",
                action_type: "script",
                command: "",
                url: "",
                contractId: "",
                timeout_ms: 30000,
                enabled: true,
              });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium text-sm transition-colors shadow-lg shadow-amber-900/20"
          >
            <PlusIcon className="w-4 h-4" />
            New Remediation Action
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Configured Actions</p>
            <p className="text-2xl font-bold text-white mt-1">{actions.length}</p>
          </div>
          <div className="p-3 bg-gray-800 rounded-lg text-amber-400">
            <ShieldExclamationIcon className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Scripts Configured</p>
            <p className="text-2xl font-bold text-white mt-1">
              {actions.filter((a) => a.action_type === "script").length}
            </p>
          </div>
          <div className="p-3 bg-gray-800 rounded-lg text-blue-400">
            <CommandLineIcon className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Webhooks Registered</p>
            <p className="text-2xl font-bold text-white mt-1">
              {actions.filter((a) => a.action_type === "webhook").length}
            </p>
          </div>
          <div className="p-3 bg-gray-800 rounded-lg text-purple-400">
            <GlobeAltIcon className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Soroban Contract Pauses</p>
            <p className="text-2xl font-bold text-white mt-1">
              {actions.filter((a) => a.action_type === "contract_pause").length}
            </p>
          </div>
          <div className="p-3 bg-gray-800 rounded-lg text-emerald-400">
            <LockClosedIcon className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setActiveTab("actions")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "actions"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Action Configurations ({actions.length})
        </button>

        <button
          onClick={() => setActiveTab("logs")}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === "logs"
              ? "border-amber-500 text-amber-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Execution Audit Logs ({logs.length})
        </button>
      </div>

      {/* Tab Contents: Actions */}
      {activeTab === "actions" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-950/60 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase">
                  <th className="py-3 px-4">Action Name</th>
                  <th className="py-3 px-4">Trigger Alert Type</th>
                  <th className="py-3 px-4">Action Type</th>
                  <th className="py-3 px-4">Timeout</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 text-sm">
                {actions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No remediation actions configured yet. Click "New Remediation Action" to register one.
                    </td>
                  </tr>
                ) : (
                  actions.map((action) => (
                    <tr key={action.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-4 font-medium text-white">{action.name}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-gray-800 text-amber-300 border border-gray-700 rounded text-xs font-mono">
                          {action.alert_type}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="flex items-center gap-1.5 capitalize text-gray-300">
                          {action.action_type === "script" && <CommandLineIcon className="w-4 h-4 text-blue-400" />}
                          {action.action_type === "webhook" && <GlobeAltIcon className="w-4 h-4 text-purple-400" />}
                          {action.action_type === "contract_pause" && <LockClosedIcon className="w-4 h-4 text-emerald-400" />}
                          {action.action_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-400">{action.timeout_ms / 1000}s</td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleEnable(action)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                            action.enabled
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-gray-800 text-gray-500 border border-gray-700"
                          }`}
                        >
                          {action.enabled ? "Active" : "Disabled"}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleTestRun(action.id)}
                          disabled={testingId === action.id}
                          className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-amber-400 rounded text-xs font-medium border border-gray-700 inline-flex items-center gap-1"
                        >
                          <PlayIcon className={`w-3 h-3 ${testingId === action.id ? "animate-spin" : ""}`} />
                          Test Run
                        </button>

                        <button
                          onClick={() => handleDelete(action.id)}
                          className="p-1 text-gray-500 hover:text-red-400 transition-colors inline-block"
                          title="Delete Action"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Contents: Logs */}
      {activeTab === "logs" && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-950/60 border-b border-gray-800 text-xs font-semibold text-gray-400 uppercase">
                  <th className="py-3 px-4">Executed At</th>
                  <th className="py-3 px-4">Alert Type</th>
                  <th className="py-3 px-4">Action Type</th>
                  <th className="py-3 px-4">Execution Status</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60 text-sm">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No execution logs recorded yet.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-800/40 transition-colors">
                      <td className="py-3 px-4 text-gray-300 font-mono text-xs">
                        {new Date(log.executed_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 bg-gray-800 text-amber-300 rounded text-xs font-mono">
                          {log.alert_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 capitalize text-gray-300">{log.action_type}</td>
                      <td className="py-3 px-4">
                        {log.status === "success" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-950/80 text-emerald-400 border border-emerald-800 rounded-full text-xs font-medium">
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                            Success
                          </span>
                        )}
                        {log.status === "failed" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-red-950/80 text-red-400 border border-red-800 rounded-full text-xs font-medium">
                            <XCircleIcon className="w-3.5 h-3.5" />
                            Failed
                          </span>
                        )}
                        {log.status === "pending" && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-950/80 text-amber-400 border border-amber-800 rounded-full text-xs font-medium">
                            <ClockIcon className="w-3.5 h-3.5 animate-spin" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-400 font-mono text-xs">{log.execution_time_ms} ms</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs font-medium border border-gray-700"
                        >
                          View Log
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log Output Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-4 p-6">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CommandLineIcon className="text-amber-500 w-5 h-5" />
                Execution Log Output
              </h3>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-400 hover:text-white text-lg font-bold"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-gray-400">Action Type:</span>{" "}
                  <span className="text-white font-mono">{selectedLog.action_type}</span>
                </div>
                <div>
                  <span className="text-gray-400">Duration:</span>{" "}
                  <span className="text-white font-mono">{selectedLog.execution_time_ms} ms</span>
                </div>
              </div>

              {selectedLog.output && (
                <div>
                  <label className="text-xs font-semibold text-gray-400 uppercase">Stdout / Output</label>
                  <pre className="bg-black/80 border border-gray-800 text-emerald-400 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-60 mt-1">
                    {selectedLog.output}
                  </pre>
                </div>
              )}

              {selectedLog.error_message && (
                <div>
                  <label className="text-xs font-semibold text-red-400 uppercase">Error Details</label>
                  <pre className="bg-black/80 border border-red-900/50 text-red-400 p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-40 mt-1">
                    {selectedLog.error_message}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-800">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-4">Register Remediation Action Configuration</h3>

            <form onSubmit={handleSubmitForm} className="space-y-4 text-sm">
              <div>
                <label className="block text-gray-400 font-medium mb-1">Action Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Pause Stellar Gateway Script"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-400 font-medium mb-1">Target Alert Type</label>
                  <select
                    value={formData.alert_type}
                    onChange={(e) => setFormData({ ...formData, alert_type: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="price_deviation">Price Deviation</option>
                    <option value="supply_mismatch">Supply Mismatch</option>
                    <option value="bridge_downtime">Bridge Downtime</option>
                    <option value="volume_spike">Volume Spike</option>
                    <option value="reserve_ratio">Reserve Ratio</option>
                    <option value="health_score">Health Score</option>
                    <option value="all">All Alerts</option>
                  </select>
                </div>

                <div>
                  <label className="block text-gray-400 font-medium mb-1">Action Type</label>
                  <select
                    value={formData.action_type}
                    onChange={(e) =>
                      setFormData({ ...formData, action_type: e.target.value as any })
                    }
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="script">External Script</option>
                    <option value="webhook">HTTP Webhook</option>
                    <option value="contract_pause">Soroban Contract Pause</option>
                  </select>
                </div>
              </div>

              {formData.action_type === "script" && (
                <div>
                  <label className="block text-gray-400 font-medium mb-1">Script Path / Command</label>
                  <input
                    type="text"
                    required
                    placeholder="/usr/local/bin/remediation.sh"
                    value={formData.command}
                    onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {formData.action_type === "webhook" && (
                <div>
                  <label className="block text-gray-400 font-medium mb-1">Webhook Endpoint URL</label>
                  <input
                    type="url"
                    required
                    placeholder="https://admin.bridge.watch/api/v1/webhook"
                    value={formData.url}
                    onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {formData.action_type === "contract_pause" && (
                <div>
                  <label className="block text-gray-400 font-medium mb-1">Soroban Contract ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="C12345..."
                    value={formData.contractId}
                    onChange={(e) => setFormData({ ...formData, contractId: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white font-medium rounded-lg hover:bg-amber-500"
                >
                  Save Action
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CircuitBreakerActions;
