import { useEffect, useState, type FormEvent } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

// =============================================================================
// TYPES
// =============================================================================

type ErrorSeverity = "info" | "warning" | "error" | "critical";
type ErrorCategory =
  | "network"
  | "auth"
  | "validation"
  | "bridge"
  | "rate_limit"
  | "internal";

interface ErrorCatalogEntry {
  id: string;
  errorCode: string;
  title: string;
  messageTemplate: string;
  httpStatus: number;
  severity: ErrorSeverity;
  category: ErrorCategory;
  retryGuidance: string | null;
  documentationUrl: string | null;
  isActive: boolean;
  createdBy: string;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

const SEVERITIES: ErrorSeverity[] = ["info", "warning", "error", "critical"];
const CATEGORIES: ErrorCategory[] = [
  "network",
  "auth",
  "validation",
  "bridge",
  "rate_limit",
  "internal",
];

const SEVERITY_BADGE: Record<
  ErrorSeverity,
  { bg: string; text: string }
> = {
  info: { bg: "bg-blue-500/15", text: "text-blue-300" },
  warning: { bg: "bg-yellow-500/15", text: "text-yellow-300" },
  error: { bg: "bg-orange-500/15", text: "text-orange-300" },
  critical: { bg: "bg-red-500/15", text: "text-red-300" },
};

const INITIAL_FORM = {
  errorCode: "",
  title: "",
  messageTemplate: "",
  httpStatus: 500,
  severity: "error" as ErrorSeverity,
  category: "internal" as ErrorCategory,
  retryGuidance: "",
  documentationUrl: "",
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

export default function ErrorCatalog() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );
  const [entries, setEntries] = useState<ErrorCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [filterSeverity, setFilterSeverity] = useState<ErrorSeverity | "">("");
  const [filterCategory, setFilterCategory] = useState<ErrorCategory | "">("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const loadEntries = async () => {
    if (!adminToken) {
      setEntries([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterSeverity) params.set("severity", filterSeverity);
      if (filterCategory) params.set("category", filterCategory);
      if (includeInactive) params.set("includeInactive", "true");
      const qs = params.toString();
      const data = await apiFetch<{ entries: ErrorCatalogEntry[] }>(
        `/admin/error-catalog${qs ? `?${qs}` : ""}`,
        adminToken
      );
      setEntries(data.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entries");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken, filterSeverity, filterCategory, includeInactive]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken) {
      setError("Enter an admin token first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/admin/error-catalog", adminToken, {
        method: "POST",
        body: JSON.stringify({
          errorCode: form.errorCode.toUpperCase(),
          title: form.title,
          messageTemplate: form.messageTemplate,
          httpStatus: form.httpStatus,
          severity: form.severity,
          category: form.category,
          retryGuidance: form.retryGuidance || undefined,
          documentationUrl: form.documentationUrl || undefined,
        }),
      });
      setForm(INITIAL_FORM);
      setShowForm(false);
      await loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create entry");
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/admin/error-catalog/${id}`, adminToken, {
        method: "DELETE",
      });
      await loadEntries();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deactivate entry");
    } finally {
      setLoading(false);
    }
  };

  // Group entries by category for display
  const grouped = entries.reduce<Record<string, ErrorCatalogEntry[]>>(
    (acc, entry) => {
      const key = entry.category;
      if (!acc[key]) acc[key] = [];
      acc[key].push(entry);
      return acc;
    },
    {}
  );

  // Render template preview with placeholder highlighting
  const renderTemplatePreview = (template: string) => {
    const parts = template.split(/(\{[^}]+\})/g);
    return (
      <span>
        {parts.map((part, i) =>
          /^\{[^}]+\}$/.test(part) ? (
            <span
              key={i}
              className="rounded bg-stellar-blue/20 px-1 text-stellar-blue font-mono"
            >
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Error catalog</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Manage the structured error catalog. Entries provide consistent
            titles, parameterised messages, and retry guidance for known error
            codes across the platform.
          </p>
        </div>
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
            Active entries
          </p>
          <p className="mt-2 text-3xl font-semibold text-white">
            {entries.filter((e) => e.isActive).length}
          </p>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            Total loaded: {entries.length}
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

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-3 rounded-3xl border border-stellar-border bg-stellar-card/80 p-4">
        <span className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
          Filter
        </span>
        <select
          value={filterSeverity}
          onChange={(e) =>
            setFilterSeverity(e.target.value as ErrorSeverity | "")
          }
          className="rounded-xl border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white outline-none focus:border-stellar-blue"
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filterCategory}
          onChange={(e) =>
            setFilterCategory(e.target.value as ErrorCategory | "")
          }
          className="rounded-xl border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white outline-none focus:border-stellar-blue"
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-stellar-text-secondary">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="h-4 w-4 rounded border-stellar-border bg-stellar-dark text-stellar-blue"
          />
          Include inactive
        </label>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
        >
          {showForm ? "Hide form" : "Add entry"}
        </button>
      </section>

      {/* Create form */}
      {showForm && (
        <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Add catalog entry
          </h2>
          <form onSubmit={handleCreate} className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Error code <span aria-hidden>*</span>
              </span>
              <input
                required
                type="text"
                value={form.errorCode}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    errorCode: e.target.value.toUpperCase(),
                  }))
                }
                placeholder="BRIDGE_TIMEOUT"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 font-mono text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Title <span aria-hidden>*</span>
              </span>
              <input
                required
                type="text"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="Bridge connection timed out"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-white">
                Message template <span aria-hidden>*</span>
              </span>
              <input
                required
                type="text"
                value={form.messageTemplate}
                onChange={(e) =>
                  setForm((f) => ({ ...f, messageTemplate: e.target.value }))
                }
                placeholder="Request to {bridge} timed out after {timeout_ms}ms"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
              {form.messageTemplate && (
                <p className="mt-2 text-xs text-stellar-text-secondary">
                  Preview: {renderTemplatePreview(form.messageTemplate)}
                </p>
              )}
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                HTTP status <span aria-hidden>*</span>
              </span>
              <input
                required
                type="number"
                min={100}
                max={599}
                value={form.httpStatus}
                onChange={(e) =>
                  setForm((f) => ({ ...f, httpStatus: Number(e.target.value) }))
                }
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white">
                  Severity
                </span>
                <select
                  value={form.severity}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      severity: e.target.value as ErrorSeverity,
                    }))
                  }
                  className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none focus:border-stellar-blue"
                >
                  {SEVERITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-white">
                  Category
                </span>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      category: e.target.value as ErrorCategory,
                    }))
                  }
                  className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none focus:border-stellar-blue"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-white">
                Retry guidance
              </span>
              <input
                type="text"
                value={form.retryGuidance}
                onChange={(e) =>
                  setForm((f) => ({ ...f, retryGuidance: e.target.value }))
                }
                placeholder="Retry with exponential backoff after 5 seconds"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-white">
                Documentation URL
              </span>
              <input
                type="url"
                value={form.documentationUrl}
                onChange={(e) =>
                  setForm((f) => ({ ...f, documentationUrl: e.target.value }))
                }
                placeholder="https://docs.example.com/errors/bridge-timeout"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>

            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Creating…" : "Add entry"}
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
        </section>
      )}

      {/* Entries grouped by category */}
      {loading && entries.length === 0 ? (
        <div className="py-10 text-center text-sm text-stellar-text-secondary">
          Loading…
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-10 text-center text-sm text-stellar-text-secondary">
          {adminToken ? "No catalog entries found." : "Add an admin token to load entries."}
        </div>
      ) : (
        Object.entries(grouped).map(([category, catEntries]) => (
          <section
            key={category}
            className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6"
          >
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-stellar-text-secondary">
              {category}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-stellar-border text-xs uppercase tracking-wider text-stellar-text-secondary">
                    <th className="py-3 px-3 font-semibold text-white">Code</th>
                    <th className="py-3 px-3 font-semibold text-white">Title</th>
                    <th className="py-3 px-3 font-semibold text-white">Template</th>
                    <th className="py-3 px-3 font-semibold text-white">HTTP</th>
                    <th className="py-3 px-3 font-semibold text-white">Severity</th>
                    <th className="py-3 px-3 font-semibold text-white text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stellar-border/50">
                  {catEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`transition hover:bg-stellar-dark/50 ${
                        !entry.isActive ? "opacity-50" : ""
                      }`}
                    >
                      <td className="py-3 px-3">
                        <code className="rounded bg-stellar-dark px-2 py-0.5 text-xs text-stellar-blue">
                          {entry.errorCode}
                        </code>
                      </td>
                      <td className="py-3 px-3 font-medium text-white">
                        {entry.title}
                      </td>
                      <td className="py-3 px-3 max-w-xs text-xs text-stellar-text-secondary">
                        {renderTemplatePreview(entry.messageTemplate)}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-stellar-text-secondary">
                        {entry.httpStatus}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${SEVERITY_BADGE[entry.severity].bg} ${SEVERITY_BADGE[entry.severity].text}`}
                        >
                          {entry.severity}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {entry.isActive && (
                          <button
                            type="button"
                            onClick={() => void handleDeactivate(entry.id)}
                            className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-300 transition hover:bg-red-500/10"
                          >
                            Deactivate
                          </button>
                        )}
                        {!entry.isActive && (
                          <span className="text-xs text-stellar-text-secondary">
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
