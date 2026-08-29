import { useState, type FormEvent } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

// =============================================================================
// TYPES
// =============================================================================

interface ConfigVersion {
  id: string;
  configKey: string;
  versionNumber: number;
  payload: Record<string, unknown>;
  changeSummary: string | null;
  appliedBy: string;
  appliedAt: string;
  isCurrent: boolean;
}

type FieldChangeType = "modified" | "added" | "removed";

interface FieldDiff {
  field: string;
  currentValue: unknown;
  targetValue: unknown;
  changeType: FieldChangeType;
}

interface RollbackPreview {
  configKey: string;
  currentVersion: number;
  targetVersion: number;
  diff: FieldDiff[];
  impactSummary: string;
}

const DIFF_STYLE: Record<
  FieldChangeType,
  { row: string; badge: string; label: string }
> = {
  modified: {
    row: "bg-yellow-500/5",
    badge: "bg-yellow-500/15 text-yellow-300",
    label: "modified",
  },
  added: {
    row: "bg-emerald-500/5",
    badge: "bg-emerald-500/15 text-emerald-300",
    label: "added",
  },
  removed: {
    row: "bg-red-500/5",
    badge: "bg-red-500/15 text-red-300",
    label: "removed",
  },
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

export default function ConfigRollback() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );

  // Config key management
  const [configKey, setConfigKey] = useState("");
  const [submittedKey, setSubmittedKey] = useState("");

  // Version history
  const [versions, setVersions] = useState<ConfigVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Rollback preview
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [preview, setPreview] = useState<RollbackPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Rollback apply
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState<string | null>(null);

  // Create initial version
  const [showCreate, setShowCreate] = useState(false);
  const [createKey, setCreateKey] = useState("");
  const [createPayload, setCreatePayload] = useState("{}");
  const [createSummary, setCreateSummary] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const loadHistory = async (key: string) => {
    if (!adminToken || !key.trim()) return;
    setHistoryLoading(true);
    setHistoryError(null);
    setVersions([]);
    setSelectedVersion(null);
    setPreview(null);
    try {
      const data = await apiFetch<{ versions: ConfigVersion[] }>(
        `/admin/config-versions/${encodeURIComponent(key)}`,
        adminToken
      );
      setVersions(data.versions);
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "Failed to load version history"
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleLookup = (e: FormEvent) => {
    e.preventDefault();
    setSubmittedKey(configKey.trim());
    void loadHistory(configKey.trim());
  };

  const handleSelectVersion = async (versionNumber: number) => {
    setSelectedVersion(versionNumber);
    setPreview(null);
    setPreviewError(null);
    setApplySuccess(null);

    if (!submittedKey || !adminToken) return;

    const current = versions.find((v) => v.isCurrent);
    if (current && current.versionNumber === versionNumber) {
      setPreviewError("This is the current version — no rollback needed.");
      return;
    }

    setPreviewLoading(true);
    try {
      const result = await apiFetch<RollbackPreview>(
        `/admin/config-versions/${encodeURIComponent(submittedKey)}/rollback-preview/${versionNumber}`,
        adminToken
      );
      setPreview(result);
    } catch (e) {
      setPreviewError(
        e instanceof Error ? e.message : "Failed to load rollback preview"
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleApplyRollback = async () => {
    if (!submittedKey || selectedVersion === null || !adminToken) return;
    setApplyLoading(true);
    setApplyError(null);
    setApplySuccess(null);
    try {
      await apiFetch(
        `/admin/config-versions/${encodeURIComponent(submittedKey)}/rollback/${selectedVersion}`,
        adminToken,
        { method: "POST", body: JSON.stringify({}) }
      );
      setApplySuccess(
        `Rollback applied. A new version has been created with the v${selectedVersion} payload as the current state.`
      );
      setSelectedVersion(null);
      setPreview(null);
      await loadHistory(submittedKey);
    } catch (e) {
      setApplyError(
        e instanceof Error ? e.message : "Failed to apply rollback"
      );
    } finally {
      setApplyLoading(false);
    }
  };

  const handleCreateVersion = async (e: FormEvent) => {
    e.preventDefault();
    if (!adminToken || !createKey.trim()) return;

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(createPayload) as Record<string, unknown>;
      setCreateError(null);
    } catch {
      setCreateError("Payload must be valid JSON.");
      return;
    }

    setCreateLoading(true);
    try {
      await apiFetch(
        `/admin/config-versions/${encodeURIComponent(createKey.trim())}`,
        adminToken,
        {
          method: "POST",
          body: JSON.stringify({
            payload,
            changeSummary: createSummary || undefined,
          }),
        }
      );
      setShowCreate(false);
      setCreateKey("");
      setCreatePayload("{}");
      setCreateSummary("");
      if (createKey.trim() === submittedKey) {
        await loadHistory(submittedKey);
      }
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : "Failed to create config version"
      );
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
          <h1 className="mt-2 text-3xl font-bold text-white">
            Config rollback preview
          </h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Browse version history for any config key, preview the field-level
            diff of a proposed rollback, and apply it safely. Rollbacks create a
            new version record — history is never overwritten.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
          >
            {showCreate ? "Hide" : "Create version"}
          </button>
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

      {/* Create version form */}
      {showCreate && (
        <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Create config version
          </h2>
          <form
            onSubmit={handleCreateVersion}
            className="grid gap-5 sm:grid-cols-2"
          >
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Config key <span aria-hidden>*</span>
              </span>
              <input
                required
                type="text"
                value={createKey}
                onChange={(e) => setCreateKey(e.target.value)}
                placeholder="alert-thresholds"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">
                Change summary
              </span>
              <input
                type="text"
                value={createSummary}
                onChange={(e) => setCreateSummary(e.target.value)}
                placeholder="Initial configuration"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-2 block text-sm font-medium text-white">
                Payload (JSON) <span aria-hidden>*</span>
              </span>
              <textarea
                required
                rows={5}
                value={createPayload}
                onChange={(e) => {
                  setCreatePayload(e.target.value);
                  setCreateError(null);
                }}
                spellCheck={false}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 font-mono text-xs text-white outline-none transition focus:border-stellar-blue resize-none"
              />
              {createError && (
                <p className="mt-1 text-xs text-red-300">{createError}</p>
              )}
            </label>
            <div className="flex gap-3 sm:col-span-2">
              <button
                type="submit"
                disabled={createLoading}
                className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
              >
                {createLoading ? "Creating…" : "Create version"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-2xl border border-stellar-border px-5 py-3 text-sm font-semibold text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Config key lookup */}
      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">Version history</h2>
        <form onSubmit={handleLookup} className="flex flex-wrap items-end gap-4">
          <label className="block flex-1">
            <span className="mb-2 block text-sm font-medium text-white">
              Config key
            </span>
            <input
              type="text"
              value={configKey}
              onChange={(e) => setConfigKey(e.target.value)}
              placeholder="alert-thresholds"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <button
            type="submit"
            disabled={!adminToken || !configKey.trim()}
            className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            Load history
          </button>
        </form>

        {historyError && (
          <p className="mt-3 text-sm text-red-300" role="alert">{historyError}</p>
        )}

        {historyLoading && (
          <p className="mt-4 text-sm text-stellar-text-secondary">Loading…</p>
        )}

        {!historyLoading && submittedKey && versions.length === 0 && !historyError && (
          <p className="mt-4 text-sm text-stellar-text-secondary">
            No versions found for <code className="text-white">{submittedKey}</code>.
          </p>
        )}

        {versions.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-stellar-border text-xs uppercase tracking-wider text-stellar-text-secondary">
                  <th className="py-3 px-3 font-semibold text-white">Version</th>
                  <th className="py-3 px-3 font-semibold text-white">Summary</th>
                  <th className="py-3 px-3 font-semibold text-white">Applied by</th>
                  <th className="py-3 px-3 font-semibold text-white">Applied at</th>
                  <th className="py-3 px-3 font-semibold text-white">Status</th>
                  <th className="py-3 px-3 font-semibold text-white text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border/50">
                {versions.map((v) => (
                  <tr
                    key={v.id}
                    className={`transition hover:bg-stellar-dark/50 ${
                      selectedVersion === v.versionNumber
                        ? "bg-stellar-blue/5"
                        : ""
                    }`}
                  >
                    <td className="py-3 px-3 font-mono font-semibold text-white">
                      v{v.versionNumber}
                    </td>
                    <td className="py-3 px-3 text-xs text-stellar-text-secondary max-w-xs">
                      {v.changeSummary ?? "—"}
                    </td>
                    <td className="py-3 px-3 text-xs text-stellar-text-secondary">
                      {v.appliedBy}
                    </td>
                    <td className="py-3 px-3 text-xs text-stellar-text-secondary">
                      {new Date(v.appliedAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-3">
                      {v.isCurrent ? (
                        <span className="inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-emerald-300">
                          current
                        </span>
                      ) : (
                        <span className="text-xs text-stellar-text-secondary">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {!v.isCurrent && (
                        <button
                          type="button"
                          onClick={() => void handleSelectVersion(v.versionNumber)}
                          className="rounded-full border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
                        >
                          Preview rollback
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Rollback preview panel */}
      {(previewLoading || preview || previewError || applySuccess || applyError) && (
        <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Rollback preview
            {selectedVersion && (
              <span className="ml-2 font-mono text-stellar-blue">
                → v{selectedVersion}
              </span>
            )}
          </h2>

          {previewLoading && (
            <p className="text-sm text-stellar-text-secondary">
              Computing diff…
            </p>
          )}

          {previewError && (
            <p className="text-sm text-red-300" role="alert">{previewError}</p>
          )}

          {applySuccess && (
            <div
              role="status"
              className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300"
            >
              {applySuccess}
            </div>
          )}

          {applyError && (
            <p className="text-sm text-red-300" role="alert">{applyError}</p>
          )}

          {preview && (
            <div className="space-y-4">
              {/* Impact summary */}
              <div className="rounded-2xl border border-stellar-border bg-stellar-dark/50 p-4">
                <p className="text-sm text-stellar-text-secondary">
                  {preview.impactSummary}
                </p>
              </div>

              {/* Diff table */}
              {preview.diff.length === 0 ? (
                <p className="text-sm text-stellar-text-secondary">
                  No field changes — payloads are identical.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-stellar-border text-xs uppercase tracking-wider text-stellar-text-secondary">
                        <th className="py-3 px-3 font-semibold text-white">Field</th>
                        <th className="py-3 px-3 font-semibold text-white">Change</th>
                        <th className="py-3 px-3 font-semibold text-white">Current value</th>
                        <th className="py-3 px-3 font-semibold text-white">Target value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stellar-border/50">
                      {preview.diff.map((diff) => (
                        <tr
                          key={diff.field}
                          className={`${DIFF_STYLE[diff.changeType].row}`}
                        >
                          <td className="py-3 px-3 font-mono text-xs text-white">
                            {diff.field}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${DIFF_STYLE[diff.changeType].badge}`}
                            >
                              {DIFF_STYLE[diff.changeType].label}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-xs text-stellar-text-secondary max-w-xs break-all">
                            {diff.currentValue !== undefined
                              ? JSON.stringify(diff.currentValue)
                              : <span className="italic">—</span>}
                          </td>
                          <td className="py-3 px-3 font-mono text-xs text-white max-w-xs break-all">
                            {diff.targetValue !== undefined
                              ? JSON.stringify(diff.targetValue)
                              : <span className="italic">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Apply button */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => void handleApplyRollback()}
                  disabled={applyLoading}
                  className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {applyLoading ? "Applying…" : `Apply rollback to v${selectedVersion}`}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    setSelectedVersion(null);
                    setPreviewError(null);
                  }}
                  className="rounded-2xl border border-stellar-border px-5 py-3 text-sm font-semibold text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
