import React, { useState } from "react";

interface SensitiveFieldDef {
  id: string;
  resourceName: string;
  fieldName: string;
  sensitivityLevel: "low" | "medium" | "high" | "critical";
  description?: string;
}

interface AccessLog {
  id: string;
  resourceName: string;
  fieldName: string;
  actorId: string;
  actorRole: string;
  accessType: "read" | "export" | "decrypted" | "modified";
  reason?: string;
  ipAddress?: string;
  timestamp: string;
}

interface ComplianceReport {
  id: string;
  title: string;
  timeRangeStart: string;
  timeRangeEnd: string;
  totalAccesses: number;
  uniqueActors: number;
  criticalAccesses: number;
  generatedBy: string;
  createdAt: string;
}

export default function SensitiveFieldAccessReport() {
  const [activeTab, setActiveTab] = useState<"definitions" | "logs" | "reports">("reports");

  const [definitions, setDefinitions] = useState<SensitiveFieldDef[]>([
    {
      id: "def-1",
      resourceName: "api_keys",
      fieldName: "secret",
      sensitivityLevel: "critical",
      description: "API Key secret tokens used for integrator authorization",
    },
    {
      id: "def-2",
      resourceName: "bridge_wallets",
      fieldName: "private_key",
      sensitivityLevel: "critical",
      description: "Bridge custodial signing private keys",
    },
    {
      id: "def-3",
      resourceName: "users",
      fieldName: "email",
      sensitivityLevel: "high",
      description: "Operator user account email addresses (PII)",
    },
  ]);

  const [logs] = useState<AccessLog[]>([
    {
      id: "log-101",
      resourceName: "api_keys",
      fieldName: "secret",
      actorId: "usr-admin-01",
      actorRole: "admin",
      accessType: "read",
      reason: "Key secret rotation check",
      ipAddress: "192.168.1.15",
      timestamp: new Date().toISOString(),
    },
    {
      id: "log-102",
      resourceName: "bridge_wallets",
      fieldName: "private_key",
      actorId: "usr-sec-02",
      actorRole: "auditor",
      accessType: "decrypted",
      reason: "SOC2 Compliance Verification",
      ipAddress: "10.0.2.88",
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
  ]);

  const [reports, setReports] = useState<ComplianceReport[]>([
    {
      id: "rep-1",
      title: "Q3 SOC2 Sensitive Field Access Report",
      timeRangeStart: new Date(Date.now() - 30 * 86400000).toISOString(),
      timeRangeEnd: new Date().toISOString(),
      totalAccesses: 142,
      uniqueActors: 8,
      criticalAccesses: 12,
      generatedBy: "compliance-officer",
      createdAt: new Date().toISOString(),
    },
  ]);

  const [showAddDefModal, setShowAddDefModal] = useState(false);
  const [newResource, setNewResource] = useState("");
  const [newField, setNewField] = useState("");
  const [newLevel, setNewLevel] = useState<"low" | "medium" | "high" | "critical">("medium");

  const [showGenReportModal, setShowGenReportModal] = useState(false);
  const [reportTitle, setReportTitle] = useState("");

  const handleAddDefinition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newResource.trim() || !newField.trim()) return;

    const created: SensitiveFieldDef = {
      id: `def-${Date.now()}`,
      resourceName: newResource.trim(),
      fieldName: newField.trim(),
      sensitivityLevel: newLevel,
      description: "Custom sensitive field definition",
    };

    setDefinitions([...definitions, created]);
    setNewResource("");
    setNewField("");
    setShowAddDefModal(false);
  };

  const handleGenerateReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportTitle.trim()) return;

    const created: ComplianceReport = {
      id: `rep-${Date.now()}`,
      title: reportTitle.trim(),
      timeRangeStart: new Date(Date.now() - 7 * 86400000).toISOString(),
      timeRangeEnd: new Date().toISOString(),
      totalAccesses: logs.length,
      uniqueActors: new Set(logs.map((l) => l.actorId)).size,
      criticalAccesses: logs.filter((l) => l.resourceName === "bridge_wallets").length,
      generatedBy: "operator",
      createdAt: new Date().toISOString(),
    };

    setReports([created, ...reports]);
    setReportTitle("");
    setShowGenReportModal(false);
  };

  const getLevelBadge = (level: string) => {
    switch (level) {
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Sensitive Field Access Reports</h1>
          <p className="text-sm text-stellar-text-secondary">
            Audit sensitive field accesses (secrets, private keys, PII) and generate compliance reports.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddDefModal(true)}
            className="rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white hover:bg-stellar-border transition"
          >
            + Register Sensitive Field
          </button>
          <button
            onClick={() => setShowGenReportModal(true)}
            className="rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white hover:bg-stellar-blue/80 transition"
          >
            + Generate Access Report
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-stellar-border space-x-4">
        <button
          onClick={() => setActiveTab("reports")}
          className={`pb-2 text-sm font-medium transition border-b-2 ${
            activeTab === "reports"
              ? "border-stellar-blue text-white"
              : "border-transparent text-stellar-text-secondary hover:text-white"
          }`}
        >
          Compliance Access Reports ({reports.length})
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`pb-2 text-sm font-medium transition border-b-2 ${
            activeTab === "logs"
              ? "border-stellar-blue text-white"
              : "border-transparent text-stellar-text-secondary hover:text-white"
          }`}
        >
          Real-time Access Audit Log ({logs.length})
        </button>
        <button
          onClick={() => setActiveTab("definitions")}
          className={`pb-2 text-sm font-medium transition border-b-2 ${
            activeTab === "definitions"
              ? "border-stellar-blue text-white"
              : "border-transparent text-stellar-text-secondary hover:text-white"
          }`}
        >
          Sensitive Fields Registry ({definitions.length})
        </button>
      </div>

      {/* Tab: Reports */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {reports.map((rep) => (
              <div key={rep.id} className="rounded-lg border border-stellar-border bg-stellar-card p-5 space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-white text-base">{rep.title}</h3>
                  <span className="text-xs text-stellar-text-secondary font-mono">{rep.id}</span>
                </div>
                <div className="space-y-1 text-xs text-stellar-text-secondary">
                  <div>Generated By: <span className="text-white">{rep.generatedBy}</span></div>
                  <div>Total Sensitive Accesses: <span className="text-white font-bold">{rep.totalAccesses}</span></div>
                  <div>Unique Operators: <span className="text-white font-bold">{rep.uniqueActors}</span></div>
                  <div>Critical Field Accesses: <span className="text-red-400 font-bold">{rep.criticalAccesses}</span></div>
                </div>
                <div className="pt-2 border-t border-stellar-border flex justify-between items-center text-xs">
                  <span className="text-stellar-text-secondary">{new Date(rep.createdAt).toLocaleDateString()}</span>
                  <button className="text-stellar-blue hover:underline">Download Summary JSON</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Logs */}
      {activeTab === "logs" && (
        <div className="overflow-x-auto rounded-lg border border-stellar-border bg-stellar-card">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-stellar-border bg-stellar-dark text-xs uppercase text-stellar-text-secondary">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Resource & Field</th>
                <th className="px-4 py-3">Actor / Role</th>
                <th className="px-4 py-3">Access Type</th>
                <th className="px-4 py-3">Justification Reason</th>
                <th className="px-4 py-3">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stellar-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-stellar-dark/50 transition">
                  <td className="px-4 py-3 text-xs text-stellar-text-secondary">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white">
                    {log.resourceName} . <span className="text-stellar-blue font-bold">{log.fieldName}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="text-white font-medium">{log.actorId}</span> ({log.actorRole})
                  </td>
                  <td className="px-4 py-3 capitalize text-xs">
                    <span className="rounded bg-stellar-dark border border-stellar-border px-2 py-0.5 text-stellar-text-secondary">
                      {log.accessType}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-stellar-text-secondary">{log.reason || "N/A"}</td>
                  <td className="px-4 py-3 text-xs font-mono text-stellar-text-secondary">{log.ipAddress}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Definitions */}
      {activeTab === "definitions" && (
        <div className="overflow-x-auto rounded-lg border border-stellar-border bg-stellar-card">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-stellar-border bg-stellar-dark text-xs uppercase text-stellar-text-secondary">
              <tr>
                <th className="px-4 py-3">Resource Name</th>
                <th className="px-4 py-3">Field Name</th>
                <th className="px-4 py-3">Sensitivity Level</th>
                <th className="px-4 py-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stellar-border">
              {definitions.map((def) => (
                <tr key={def.id} className="hover:bg-stellar-dark/50 transition">
                  <td className="px-4 py-3 font-mono text-white">{def.resourceName}</td>
                  <td className="px-4 py-3 font-mono font-bold text-stellar-blue">{def.fieldName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${getLevelBadge(
                        def.sensitivityLevel
                      )}`}
                    >
                      {def.sensitivityLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-stellar-text-secondary">{def.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Definition Modal */}
      {showAddDefModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleAddDefinition} className="w-full max-w-md rounded-lg border border-stellar-border bg-stellar-card p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white">Register Sensitive Field</h3>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Resource Name</label>
              <input
                type="text"
                required
                placeholder="e.g. users, api_keys, wallets"
                value={newResource}
                onChange={(e) => setNewResource(e.target.value)}
                className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Field Name</label>
              <input
                type="text"
                required
                placeholder="e.g. secret, ssn, private_key"
                value={newField}
                onChange={(e) => setNewField(e.target.value)}
                className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Sensitivity Level</label>
              <select
                value={newLevel}
                onChange={(e) => setNewLevel(e.target.value as any)}
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
                onClick={() => setShowAddDefModal(false)}
                className="rounded border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-stellar-blue px-4 py-2 text-sm text-white hover:bg-stellar-blue/80"
              >
                Register Field
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Generate Report Modal */}
      {showGenReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleGenerateReport} className="w-full max-w-md rounded-lg border border-stellar-border bg-stellar-card p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white">Generate Compliance Access Report</h3>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Report Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Q3 SOC2 Sensitive Field Access Audit"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowGenReportModal(false)}
                className="rounded border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded bg-stellar-blue px-4 py-2 text-sm text-white hover:bg-stellar-blue/80"
              >
                Compile Report
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
