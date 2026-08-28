import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createApiKeyTemplate,
  listApiKeyTemplates,
  updateApiKeyTemplate,
} from "../../services/api";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { ApiKeyScopeTemplate } from "../../types";

const AVAILABLE_SCOPES = [
  "admin:api-keys",
  "jobs:read",
  "jobs:trigger",
  "datasets:read",
  "datasets:write",
  "imports:preview",
  "quarantine:manage",
];

export default function ApiKeyScopeTemplates() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );
  const [templates, setTemplates] = useState<ApiKeyScopeTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    rateLimitPerMinute: 120,
    scopes: ["jobs:read"],
  });

  const loadTemplates = async () => {
    if (!adminToken) {
      setTemplates([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await listApiKeyTemplates(adminToken, true);
      setTemplates(response.templates);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const toggleScope = (scope: string) => {
    setForm((current) => ({
      ...current,
      scopes: current.scopes.includes(scope)
        ? current.scopes.filter((entry) => entry !== scope)
        : [...current.scopes, scope],
    }));
  };

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!adminToken) {
      setError("Enter an admin API key first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createApiKeyTemplate(adminToken, {
        name: form.name,
        description: form.description || undefined,
        scopes: form.scopes,
        rateLimitPerMinute: form.rateLimitPerMinute,
      });
      setForm({ name: "", description: "", rateLimitPerMinute: 120, scopes: ["jobs:read"] });
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (template: ApiKeyScopeTemplate) => {
    if (!adminToken) return;
    setError(null);
    try {
      await updateApiKeyTemplate(adminToken, template.id, { isActive: !template.isActive });
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update template");
    }
  };

  const activeCount = useMemo(() => templates.filter((t) => t.isActive).length, [templates]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
          <h1 className="mt-2 text-3xl font-bold text-white">API key scope templates</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Define reusable scope and rate-limit bundles so operators can issue
            API keys with a consistent, governed permission set.
          </p>
        </div>
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 px-5 py-4">
          <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">Active templates</p>
          <p className="mt-2 text-3xl font-semibold text-white">{activeCount}</p>
        </div>
      </header>

      {!adminToken && (
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 p-6">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Admin or bootstrap token</span>
            <input
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Paste your admin API key"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <form onSubmit={handleCreate} className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <h2 className="text-xl font-semibold text-white">New template</h2>
          <div className="mt-6 space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Template name</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
                placeholder="Read-only analyst"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Description</span>
              <input
                type="text"
                value={form.description}
                onChange={(event) => setForm((c) => ({ ...c, description: event.target.value }))}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Rate limit / minute</span>
              <input
                type="number"
                min={1}
                value={form.rateLimitPerMinute}
                onChange={(event) => setForm((c) => ({ ...c, rateLimitPerMinute: Number(event.target.value) }))}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <div>
              <p className="mb-3 text-sm font-medium text-white">Scopes</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {AVAILABLE_SCOPES.map((scope) => {
                  const checked = form.scopes.includes(scope);
                  return (
                    <label
                      key={scope}
                      className={`rounded-2xl border px-4 py-3 transition ${
                        checked
                          ? "border-stellar-blue bg-stellar-blue/10 text-white"
                          : "border-stellar-border bg-stellar-dark text-stellar-text-secondary"
                      }`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleScope(scope)} className="sr-only" />
                      <span className="text-sm font-medium">{scope}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving..." : "Create template"}
            </button>
          </div>
        </form>

        <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-xl font-semibold text-white">Existing templates</h2>
            <button
              type="button"
              onClick={() => void loadTemplates()}
              className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
            >
              Refresh
            </button>
          </div>
          <div className="mt-6 space-y-4">
            {templates.length === 0 && (
              <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
                {adminToken ? "No templates yet." : "Add an admin token to load templates."}
              </div>
            )}
            {templates.map((template) => (
              <article key={template.id} className="rounded-2xl border border-stellar-border bg-stellar-dark/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-medium text-white">{template.name}</h3>
                      <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                        template.isActive ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
                      }`}>
                        {template.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    {template.description && (
                      <p className="mt-1 text-sm text-stellar-text-secondary">{template.description}</p>
                    )}
                    <p className="mt-2 text-sm text-stellar-text-secondary">
                      Scopes: {template.scopes.join(", ")}
                    </p>
                    <p className="mt-1 text-sm text-stellar-text-secondary">
                      Rate limit: {template.rateLimitPerMinute ?? "default"}/min
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggle(template)}
                    className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
                  >
                    {template.isActive ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
