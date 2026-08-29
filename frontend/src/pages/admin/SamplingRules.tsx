import { useEffect, useState, type FormEvent } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

// =============================================================================
// TYPES
// =============================================================================

type SamplingTarget = "all_requests" | "endpoint_pattern" | "client_id";

interface SamplingRule {
  id: string;
  name: string;
  description: string | null;
  sampleRate: number;
  target: SamplingTarget;
  targetValue: string | null;
  enabled: boolean;
  priority: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const INITIAL_FORM = {
  name: "",
  description: "",
  sampleRatePct: 100,
  target: "all_requests" as SamplingTarget,
  targetValue: "",
  enabled: true,
  priority: 0,
};

const TARGET_LABELS: Record<SamplingTarget, string> = {
  all_requests: "All requests",
  endpoint_pattern: "Endpoint pattern",
  client_id: "Client ID",
};

async function apiFetch<T>(
  path: string,
  apiKey: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      msg = body.message ?? body.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function SamplingRules() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );
  const [rules, setRules] = useState<SamplingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [showForm, setShowForm] = useState(false);

  // Evaluate panel
  const [evalId, setEvalId] = useState("");
  const [evalUrl, setEvalUrl] = useState("");
  const [evalClientId, setEvalClientId] = useState("");
  const [evalResult, setEvalResult] = useState<unknown>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);

  const loadRules = async () => {
    if (!adminToken) {
      setRules([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ rules: SamplingRule[] }>(
        "/admin/sampling-rules",
        adminToken
      );
      setRules(data.rules);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken) {
      setError("Enter an admin token first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/admin/sampling-rules", adminToken, {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          sampleRate: form.sampleRatePct / 100,
          target: form.target,
          targetValue: form.targetValue || undefined,
          enabled: form.enabled,
          priority: form.priority,
        }),
      });
      setForm(INITIAL_FORM);
      setShowForm(false);
      await loadRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create rule");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (rule: SamplingRule) => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/admin/sampling-rules/${rule.id}`, adminToken, {
        method: "PATCH",
        body: JSON.stringify({ enabled: !rule.enabled }),
      });
      await loadRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update rule");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/admin/sampling-rules/${id}`, adminToken, {
        method: "DELETE",
      });
      await loadRules();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete rule");
    } finally {
      setLoading(false);
    }
  };

  const handleEvaluate = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setEvalLoading(true);
    setEvalError(null);
    setEvalResult(null);
    try {
      const params = new URLSearchParams({ id: evalId, url: evalUrl });
      if (evalClientId) params.set("clientId", evalClientId);
      const result = await apiFetch(
        `/admin/sampling-rules/evaluate?${params.toString()}`,
        adminToken
      );
      setEvalResult(result);
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : "Evaluation failed");
    } finally {
      setEvalLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            Request sampling rules
          </h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Configure which requests are included in traffic analysis. Rules are
            evaluated in priority order; the first matching rule governs the
            sampling decision.
          </p>
        </div>
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
            Active rules
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {rules.filter((r) => r.enabled).length}
          </p>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            Total: {rules.length}
          </p>
        </div>
      </header>

      {/* Admin token */}
      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white">
            Admin token
          </span>
          <input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="Paste admin API key"
            className="w-full max-w-sm rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
          />
        </label>
      </section>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {/* Create rule form */}
      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Create rule</h2>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
          >
            {showForm ? "Hide form" : "New rule"}
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mt-6 grid gap-5 sm:grid-cols-2"
          >
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-white">
                Rule name <span aria-hidden>*</span>
              </span>
              <input
                required
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                placeholder="High-traffic endpoint reduction"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-white">
                Description
              </span>
              <input
                type="text"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Optional notes"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Sample rate: {form.sampleRatePct}%
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={form.sampleRatePct}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    sampleRatePct: Number(e.target.value),
                  }))
                }
                className="w-full accent-stellar-blue"
                aria-label={`Sample rate ${form.sampleRatePct}%`}
              />
              <div className="mt-1 flex justify-between text-xs text-stellar-text-secondary">
                <span>0% (none)</span>
                <span>100% (all)</span>
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Priority (lower = first)
              </span>
              <input
                type="number"
                value={form.priority}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    priority: Number(e.target.value),
                  }))
                }
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Target
              </span>
              <select
                value={form.target}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    target: e.target.value as SamplingTarget,
                  }))
                }
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue"
              >
                {(
                  Object.keys(TARGET_LABELS) as SamplingTarget[]
                ).map((t) => (
                  <option key={t} value={t}>
                    {TARGET_LABELS[t]}
                  </option>
                ))}
              </select>
            </label>

            {form.target !== "all_requests" && (
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white">
                  {form.target === "endpoint_pattern"
                    ? "Endpoint pattern (e.g. /api/v1/prices/*)"
                    : "Client ID"}
                </span>
                <input
                  type="text"
                  value={form.targetValue}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, targetValue: e.target.value }))
                  }
                  className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
                />
              </label>
            )}

            <label className="flex items-center gap-3 rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, enabled: e.target.checked }))
                }
                className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
              <span className="text-sm font-medium text-white">
                Enable rule immediately
              </span>
            </label>

            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Creating…" : "Create rule"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setForm(INITIAL_FORM);
                }}
                className="rounded-2xl border border-stellar-border px-5 py-3 text-sm font-semibold text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Rules table */}
      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold text-white">Active rules</h2>
          <button
            type="button"
            onClick={() => void loadRules()}
            className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
          >
            Refresh
          </button>
        </div>

        {loading && rules.length === 0 ? (
          <div className="py-10 text-center text-sm text-stellar-text-secondary">
            Loading…
          </div>
        ) : rules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-10 text-center text-sm text-stellar-text-secondary">
            {adminToken ? "No sampling rules yet." : "Add an admin token to load rules."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-stellar-border text-xs uppercase tracking-wider text-stellar-text-secondary">
                  <th className="py-3 px-3 font-semibold text-white">Name</th>
                  <th className="py-3 px-3 font-semibold text-white">Rate</th>
                  <th className="py-3 px-3 font-semibold text-white">Target</th>
                  <th className="py-3 px-3 font-semibold text-white">Priority</th>
                  <th className="py-3 px-3 font-semibold text-white">Status</th>
                  <th className="py-3 px-3 font-semibold text-white text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border/50">
                {rules.map((rule) => (
                  <tr
                    key={rule.id}
                    className="transition hover:bg-stellar-dark/50"
                  >
                    <td className="py-3 px-3">
                      <p className="font-semibold text-white">{rule.name}</p>
                      {rule.description && (
                        <p className="text-xs text-stellar-text-secondary">
                          {rule.description}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono text-white">
                        {Math.round(rule.sampleRate * 100)}%
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-stellar-text-secondary">
                      <span>{TARGET_LABELS[rule.target]}</span>
                      {rule.targetValue && (
                        <span className="block font-mono text-[11px] opacity-75">
                          {rule.targetValue}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-stellar-text-secondary">
                      {rule.priority}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${
                          rule.enabled
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-stellar-border/40 text-stellar-text-secondary"
                        }`}
                      >
                        {rule.enabled ? "enabled" : "disabled"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void handleToggleEnabled(rule)}
                          className="rounded-full border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
                        >
                          {rule.enabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(rule.id)}
                          className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-300 transition hover:bg-red-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Evaluate panel */}
      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">
          Evaluate rules (dry run)
        </h2>
        <p className="mb-4 text-sm text-stellar-text-secondary">
          Test which rules would match a mock request without affecting live traffic.
        </p>
        <form onSubmit={handleEvaluate} className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">
              Request ID <span aria-hidden>*</span>
            </span>
            <input
              required
              type="text"
              value={evalId}
              onChange={(e) => setEvalId(e.target.value)}
              placeholder="req-abc123"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">
              URL <span aria-hidden>*</span>
            </span>
            <input
              required
              type="text"
              value={evalUrl}
              onChange={(e) => setEvalUrl(e.target.value)}
              placeholder="/api/v1/prices"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">
              Client ID (optional)
            </span>
            <input
              type="text"
              value={evalClientId}
              onChange={(e) => setEvalClientId(e.target.value)}
              placeholder="api-key-id or IP"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={evalLoading || !adminToken}
              className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {evalLoading ? "Evaluating…" : "Evaluate"}
            </button>
          </div>
        </form>

        {evalError && (
          <p className="mt-3 text-sm text-red-300">{evalError}</p>
        )}
        {evalResult && (
          <pre className="mt-4 overflow-x-auto rounded-2xl border border-stellar-border bg-stellar-dark p-4 text-xs text-white">
            {JSON.stringify(evalResult as Record<string, unknown>, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
