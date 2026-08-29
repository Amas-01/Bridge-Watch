import React, { useState } from "react";

interface SigningKey {
  id: string;
  keyId: string;
  secret: string;
  algorithm: string;
  owner: string;
  maxClockSkewSeconds: number;
  isActive: boolean;
  createdAt: string;
}

interface SignedLog {
  id: string;
  keyId: string;
  requestPath: string;
  requestMethod: string;
  signature: string;
  status: "valid" | "invalid_signature" | "timestamp_expired" | "key_not_found";
  clientIp?: string;
  errorMessage?: string;
  timestamp: string;
}

export default function SignedRequestVerification() {
  const [keys, setKeys] = useState<SigningKey[]>([
    {
      id: "sk-1",
      keyId: "key_live_9f8a7b6c5d4e",
      secret: "secret_hmac_key_998877665544332211",
      algorithm: "hmac-sha256",
      owner: "payment-gateway",
      maxClockSkewSeconds: 300,
      isActive: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "sk-2",
      keyId: "key_live_1a2b3c4d5e6f",
      secret: "secret_hmac_key_112233445566778899",
      algorithm: "hmac-sha256",
      owner: "partner-oracle",
      maxClockSkewSeconds: 120,
      isActive: true,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ]);

  const [logs, setLogs] = useState<SignedLog[]>([
    {
      id: "log-1",
      keyId: "key_live_9f8a7b6c5d4e",
      requestPath: "/api/v1/transactions",
      requestMethod: "POST",
      signature: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      status: "valid",
      clientIp: "192.168.1.100",
      timestamp: new Date().toISOString(),
    },
    {
      id: "log-2",
      keyId: "key_live_1a2b3c4d5e6f",
      requestPath: "/api/v1/bridges/sync",
      requestMethod: "POST",
      signature: "0000000000000000000000000000000000000000000000000000000000000000",
      status: "invalid_signature",
      clientIp: "203.0.113.5",
      errorMessage: "Signature mismatch",
      timestamp: new Date(Date.now() - 300000).toISOString(),
    },
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOwner, setNewOwner] = useState("");
  const [newAlgorithm, setNewAlgorithm] = useState("hmac-sha256");

  // Sandbox state
  const [sandboxKeyId, setSandboxKeyId] = useState("key_live_9f8a7b6c5d4e");
  const [sandboxMethod, setSandboxMethod] = useState("POST");
  const [sandboxPath, setSandboxPath] = useState("/api/v1/test");
  const [sandboxPayload, setSandboxPayload] = useState('{"amount": 100}');
  const [sandboxResult, setSandboxResult] = useState<string | null>(null);

  const handleCreateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOwner.trim()) return;

    const created: SigningKey = {
      id: `sk-${Date.now()}`,
      keyId: `key_live_${Math.random().toString(36).substring(2, 10)}`,
      secret: `secret_hmac_${Math.random().toString(36).substring(2, 14)}`,
      algorithm: newAlgorithm,
      owner: newOwner.trim(),
      maxClockSkewSeconds: 300,
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    setKeys([created, ...keys]);
    setNewOwner("");
    setShowCreateModal(false);
  };

  const handleRotateSecret = (id: string) => {
    const newSecret = `secret_hmac_${Math.random().toString(36).substring(2, 14)}`;
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, secret: newSecret } : k))
    );
  };

  const handleRevoke = (id: string) => {
    setKeys((prev) =>
      prev.map((k) => (k.id === id ? { ...k, isActive: false } : k))
    );
  };

  const runSandboxTest = () => {
    const timestamp = Date.now();
    const mockSig = `sig_${Math.random().toString(36).substring(2, 12)}`;
    setSandboxResult(
      `Generated Signature Header: X-Signature: ${mockSig}\nX-Timestamp: ${timestamp}\nX-Key-Id: ${sandboxKeyId}\nStatus: PASS (Valid Signature computed)`
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Signed Request Verification Middleware</h1>
          <p className="text-sm text-stellar-text-secondary">
            Manage HMAC signing keys, enforce request signature verification, and inspect audit logs.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white hover:bg-stellar-blue/80 transition"
        >
          + Issue New Signing Key
        </button>
      </div>

      {/* Signing Keys Table */}
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-5 space-y-4">
        <h3 className="text-base font-semibold text-white">Request Signing Credentials</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-stellar-border bg-stellar-dark text-xs uppercase text-stellar-text-secondary">
              <tr>
                <th className="px-4 py-3">Key ID</th>
                <th className="px-4 py-3">Owner / Service</th>
                <th className="px-4 py-3">Algorithm</th>
                <th className="px-4 py-3">Max Clock Skew</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stellar-border">
              {keys.map((key) => (
                <tr key={key.id} className="hover:bg-stellar-dark/50 transition">
                  <td className="px-4 py-3 font-mono font-semibold text-white">{key.keyId}</td>
                  <td className="px-4 py-3 text-xs">{key.owner}</td>
                  <td className="px-4 py-3 text-xs uppercase font-mono text-stellar-text-secondary">
                    {key.algorithm}
                  </td>
                  <td className="px-4 py-3 text-xs text-stellar-text-secondary">
                    {key.maxClockSkewSeconds}s
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold ${
                        key.isActive ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"
                      }`}
                    >
                      {key.isActive ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => handleRotateSecret(key.id)}
                      className="rounded bg-stellar-dark border border-stellar-border px-2 py-1 text-xs text-stellar-text-secondary hover:text-white"
                    >
                      Rotate Secret
                    </button>
                    {key.isActive && (
                      <button
                        onClick={() => handleRevoke(key.id)}
                        className="rounded bg-red-500/20 text-red-400 px-2 py-1 text-xs hover:bg-red-500/30"
                      >
                        Revoke Key
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signature Test Workbench Sandbox */}
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-5 space-y-4">
        <h3 className="text-base font-semibold text-white">Signature Calculation & Verification Sandbox</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-stellar-text-secondary">Signing Key ID</label>
            <select
              value={sandboxKeyId}
              onChange={(e) => setSandboxKeyId(e.target.value)}
              className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white"
            >
              {keys.map((k) => (
                <option key={k.id} value={k.keyId}>
                  {k.keyId} ({k.owner})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-stellar-text-secondary">Method & Path</label>
            <div className="flex gap-2 mt-1">
              <select
                value={sandboxMethod}
                onChange={(e) => setSandboxMethod(e.target.value)}
                className="rounded border border-stellar-border bg-stellar-dark px-2 py-1.5 text-sm text-white"
              >
                <option>POST</option>
                <option>PUT</option>
                <option>GET</option>
              </select>
              <input
                type="text"
                value={sandboxPath}
                onChange={(e) => setSandboxPath(e.target.value)}
                className="w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-stellar-text-secondary">Payload Body</label>
            <input
              type="text"
              value={sandboxPayload}
              onChange={(e) => setSandboxPayload(e.target.value)}
              className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white font-mono"
            />
          </div>
        </div>
        <button
          onClick={runSandboxTest}
          className="rounded bg-stellar-blue px-4 py-2 text-sm text-white hover:bg-stellar-blue/80"
        >
          Compute & Verify Test Signature
        </button>
        {sandboxResult && (
          <pre className="rounded border border-stellar-border bg-stellar-dark p-3 text-xs font-mono text-green-400 whitespace-pre-wrap">
            {sandboxResult}
          </pre>
        )}
      </div>

      {/* Verification Audit Log Table */}
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-5 space-y-4">
        <h3 className="text-base font-semibold text-white">Signature Verification Audit Log</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-stellar-border bg-stellar-dark text-xs uppercase text-stellar-text-secondary">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Key ID</th>
                <th className="px-4 py-3">Request</th>
                <th className="px-4 py-3">Client IP</th>
                <th className="px-4 py-3">Verification Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stellar-border">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-stellar-dark/50 transition">
                  <td className="px-4 py-3 text-xs text-stellar-text-secondary">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-white">{log.keyId}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <span className="font-bold text-stellar-blue">{log.requestMethod}</span> {log.requestPath}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-stellar-text-secondary">
                    {log.clientIp || "N/A"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold capitalize ${
                        log.status === "valid"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Key Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <form onSubmit={handleCreateKey} className="w-full max-w-md rounded-lg border border-stellar-border bg-stellar-card p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-white">Issue New Signing Key</h3>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Owner / Client Name</label>
              <input
                type="text"
                required
                placeholder="e.g. payment-processor"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stellar-text-secondary">Algorithm</label>
              <select
                value={newAlgorithm}
                onChange={(e) => setNewAlgorithm(e.target.value)}
                className="mt-1 w-full rounded border border-stellar-border bg-stellar-dark px-3 py-1.5 text-sm text-white"
              >
                <option value="hmac-sha256">HMAC-SHA256 (Recommended)</option>
                <option value="hmac-sha512">HMAC-SHA512</option>
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
                Generate Key Credentials
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
