import { useState, useEffect } from "react";

interface Quota {
  id: string;
  userId: string;
  quotaType: "daily" | "monthly";
  maxExports: number;
  currentCount: number;
  periodStart: string;
}

export default function ExportQuotas() {
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingQuota, setEditingQuota] = useState<{ userId: string; quotaType: "daily" | "monthly"; maxExports: number } | null>(null);

  useEffect(() => {
    void loadQuotas();
  }, []);

  const loadQuotas = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/export-quotas");
      if (!response.ok) throw new Error("Failed to load quotas");
      const data = await response.json();
      setQuotas(data.quotas || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveQuota = async () => {
    if (!editingQuota) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/export-quotas/${editingQuota.userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quotaType: editingQuota.quotaType,
          maxExports: editingQuota.maxExports,
        }),
      });
      if (!response.ok) throw new Error("Failed to update quota");
      setEditingQuota(null);
      await loadQuotas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setLoading(false);
    }
  };

  const groupedQuotas = quotas.reduce((acc, quota) => {
    if (!acc[quota.userId]) {
      acc[quota.userId] = [];
    }
    acc[quota.userId].push(quota);
    return acc;
  }, {} as Record<string, Quota[]>);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Export Quotas</h1>
        <p className="mt-2 max-w-2xl text-stellar-text-secondary">
          Manage user export quotas and monitor usage across the platform.
        </p>
      </header>

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Quotas List */}
      {loading && quotas.length === 0 ? (
        <div className="text-center text-stellar-text-secondary">Loading...</div>
      ) : Object.keys(groupedQuotas).length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
          No export quotas configured yet.
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedQuotas).map(([userId, userQuotas]) => (
            <article
              key={userId}
              className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6"
            >
              <h3 className="text-lg font-medium text-white">{userId}</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-stellar-border">
                      <th className="pb-2 text-left font-medium text-stellar-text-secondary">
                        Type
                      </th>
                      <th className="pb-2 text-left font-medium text-stellar-text-secondary">
                        Usage
                      </th>
                      <th className="pb-2 text-left font-medium text-stellar-text-secondary">
                        Max
                      </th>
                      <th className="pb-2 text-left font-medium text-stellar-text-secondary">
                        Period Start
                      </th>
                      <th className="pb-2 text-left font-medium text-stellar-text-secondary">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {userQuotas.map((quota) => (
                      <tr key={quota.id} className="border-b border-stellar-border/50">
                        <td className="py-2 text-white capitalize">{quota.quotaType}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-32 overflow-hidden rounded-full bg-stellar-dark">
                              <div
                                className="h-full bg-stellar-blue transition-all"
                                style={{
                                  width: `${Math.min(
                                    (quota.currentCount / quota.maxExports) * 100,
                                    100
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm text-stellar-text-secondary">
                              {quota.currentCount} / {quota.maxExports}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 text-white">{quota.maxExports}</td>
                        <td className="py-2 text-stellar-text-secondary">
                          {new Date(quota.periodStart).toLocaleDateString()}
                        </td>
                        <td className="py-2">
                          <button
                            onClick={() =>
                              setEditingQuota({
                                userId: quota.userId,
                                quotaType: quota.quotaType,
                                maxExports: quota.maxExports,
                              })
                            }
                            className="text-sm text-stellar-blue hover:underline"
                          >
                            Edit
                          </button>
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

      {/* Edit Modal */}
      {editingQuota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
          <div className="w-full max-w-md rounded-3xl border border-stellar-border bg-stellar-card p-6">
            <h2 className="text-xl font-semibold text-white">Edit Quota</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-stellar-text-secondary">
                  User ID
                </label>
                <input
                  type="text"
                  value={editingQuota.userId}
                  disabled
                  className="mt-1 w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stellar-text-secondary">
                  Quota Type
                </label>
                <input
                  type="text"
                  value={editingQuota.quotaType}
                  disabled
                  className="mt-1 w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white opacity-60"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-stellar-text-secondary">
                  Max Exports
                </label>
                <input
                  type="number"
                  value={editingQuota.maxExports}
                  onChange={(e) =>
                    setEditingQuota({
                      ...editingQuota,
                      maxExports: parseInt(e.target.value, 10),
                    })
                  }
                  className="mt-1 w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue"
                />
              </div>
              <div className="flex gap-4">
                <button
                  onClick={() => void handleSaveQuota()}
                  disabled={loading}
                  className="flex-1 rounded-2xl bg-stellar-blue px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingQuota(null)}
                  disabled={loading}
                  className="flex-1 rounded-2xl border border-stellar-border px-6 py-3 text-sm font-semibold text-stellar-text-secondary transition hover:text-white disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
