import { useState, useEffect } from "react";

interface MethodCapability {
  id: string;
  rpcEndpointUrl: string;
  methodName: string;
  isSupported: boolean;
  discoveredAt: string;
  lastCheckedAt: string;
  responseSchema: Record<string, unknown> | null;
}

interface EndpointWithCapabilities {
  endpointUrl: string;
  capabilities: MethodCapability[];
  supportedCount: number;
  totalCount: number;
  lastCheckedAt: string | null;
}

export default function RpcCapabilities() {
  const [endpoints, setEndpoints] = useState<EndpointWithCapabilities[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newEndpointUrl, setNewEndpointUrl] = useState("");
  const [refreshing, setRefreshing] = useState<string | null>(null);

  useEffect(() => {
    void loadEndpoints();
  }, []);

  const loadEndpoints = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/admin/rpc-capabilities");
      if (!response.ok) throw new Error("Failed to load RPC capabilities");
      const data = await response.json();
      setEndpoints(data.endpoints || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load endpoints");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async (endpointUrl: string) => {
    setRefreshing(endpointUrl);
    try {
      const encoded = encodeURIComponent(endpointUrl);
      const response = await fetch(
        `/api/v1/admin/rpc-capabilities/${encoded}/refresh`,
        { method: "POST" }
      );
      if (!response.ok) throw new Error("Failed to refresh capabilities");
      setTimeout(() => void loadEndpoints(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(null);
    }
  };

  const handleDiscover = async () => {
    if (!newEndpointUrl) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/admin/rpc-capabilities/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpointUrl: newEndpointUrl }),
      });
      if (!response.ok) throw new Error("Failed to discover capabilities");
      setNewEndpointUrl("");
      await loadEndpoints();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Discovery failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-white">RPC Capabilities</h1>
        <p className="mt-2 max-w-2xl text-stellar-text-secondary">
          Discover and monitor which RPC methods are supported by your configured endpoints.
        </p>
      </header>

      {/* Add New Endpoint */}
      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="text-xl font-semibold text-white">Discover New Endpoint</h2>
        <div className="mt-4 flex gap-4">
          <input
            type="text"
            value={newEndpointUrl}
            onChange={(e) => setNewEndpointUrl(e.target.value)}
            placeholder="https://eth-mainnet.g.alchemy.com/v2/..."
            className="flex-1 rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
          />
          <button
            onClick={() => void handleDiscover()}
            disabled={!newEndpointUrl || loading}
            className="rounded-2xl bg-stellar-blue px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Discover
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Endpoints List */}
      {loading && endpoints.length === 0 ? (
        <div className="text-center text-stellar-text-secondary">Loading...</div>
      ) : endpoints.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
          No RPC endpoints discovered yet. Add one above to get started.
        </div>
      ) : (
        <div className="space-y-4">
          {endpoints.map((endpoint) => (
            <article
              key={endpoint.endpointUrl}
              className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-white break-all">
                    {endpoint.endpointUrl}
                  </h3>
                  <p className="mt-1 text-sm text-stellar-text-secondary">
                    {endpoint.supportedCount} of {endpoint.totalCount} methods supported
                  </p>
                  {endpoint.lastCheckedAt && (
                    <p className="mt-1 text-xs text-stellar-text-secondary">
                      Last checked: {new Date(endpoint.lastCheckedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => void handleRefresh(endpoint.endpointUrl)}
                  disabled={refreshing === endpoint.endpointUrl}
                  className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white disabled:opacity-50"
                >
                  {refreshing === endpoint.endpointUrl ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {/* Capabilities Table */}
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stellar-border">
                      <th className="pb-2 text-left font-medium text-stellar-text-secondary">
                        Method
                      </th>
                      <th className="pb-2 text-left font-medium text-stellar-text-secondary">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {endpoint.capabilities.map((cap) => (
                      <tr key={cap.id} className="border-b border-stellar-border/50">
                        <td className="py-2 text-white">{cap.methodName}</td>
                        <td className="py-2">
                          <span
                            className={`inline-block rounded-full px-3 py-1 text-xs ${
                              cap.isSupported
                                ? "bg-emerald-500/15 text-emerald-300"
                                : "bg-red-500/15 text-red-300"
                            }`}
                          >
                            {cap.isSupported ? "Supported" : "Not Supported"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
