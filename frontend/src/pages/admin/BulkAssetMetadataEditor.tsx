import { useState, type FormEvent } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

// =============================================================================
// TYPES
// =============================================================================

interface BulkEditItemResult {
  assetId: string;
  success: boolean;
  error?: string;
}

interface BulkEditResult {
  batchId: string;
  total: number;
  succeeded: number;
  failed: number;
  results: BulkEditItemResult[];
}

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
  return res.json();
}

const INITIAL_ASSETS_TEXT = "";
const INITIAL_FIELDS_TEXT = '{\n  "category": "stablecoin",\n  "tags": ["bridged"]\n}';

// =============================================================================
// COMPONENT
// =============================================================================

export default function BulkAssetMetadataEditor() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );

  const [assetsText, setAssetsText] = useState(INITIAL_ASSETS_TEXT);
  const [fieldsText, setFieldsText] = useState(INITIAL_FIELDS_TEXT);
  const [updatedBy, setUpdatedBy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkEditResult | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);

    const symbols = assetsText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (symbols.length === 0) {
      setError("Enter at least one asset ID or symbol (one per line).");
      return;
    }

    let sharedMetadata: Record<string, unknown> = {};
    try {
      sharedMetadata = JSON.parse(fieldsText);
    } catch {
      setError("Shared fields must be valid JSON.");
      return;
    }

    if (!updatedBy.trim() || !adminToken) return;

    const items = symbols.map((symbolOrId) => ({
      assetId: symbolOrId,
      symbol: symbolOrId,
      metadata: sharedMetadata,
    }));

    setLoading(true);
    try {
      const data = await apiFetch<BulkEditResult>("/metadata/bulk", adminToken, {
        method: "POST",
        body: JSON.stringify({ items, updatedBy: updatedBy.trim() }),
      });
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to apply bulk edit");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Bulk asset metadata editor</h1>
          <p className="mt-2 max-w-2xl text-stellar-text-secondary">
            Apply the same metadata fields (category, tags, links, etc.) to many assets
            at once. Each asset is validated and updated independently, so one invalid
            entry does not block the rest of the batch.
          </p>
        </div>
      </header>

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white">Admin token</span>
          <input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="Paste admin API key"
            className="w-full max-w-sm rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
          />
        </label>
      </section>

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">Batch edit</h2>
        <form onSubmit={handleSubmit} className="grid gap-5 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-medium text-white">
              Asset IDs or symbols (one per line, or comma-separated) <span aria-hidden>*</span>
            </span>
            <textarea
              required
              rows={4}
              value={assetsText}
              onChange={(e) => setAssetsText(e.target.value)}
              placeholder={"asset_usdc_stellar\nasset_xlm_native"}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 font-mono text-xs text-white outline-none transition focus:border-stellar-blue resize-none"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">
              Updated by <span aria-hidden>*</span>
            </span>
            <input
              required
              type="text"
              value={updatedBy}
              onChange={(e) => setUpdatedBy(e.target.value)}
              placeholder="ops-user"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-2 block text-sm font-medium text-white">
              Shared metadata fields (JSON) <span aria-hidden>*</span>
            </span>
            <textarea
              required
              rows={6}
              value={fieldsText}
              onChange={(e) => setFieldsText(e.target.value)}
              spellCheck={false}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 font-mono text-xs text-white outline-none transition focus:border-stellar-blue resize-none"
            />
          </label>
          {error && (
            <p className="sm:col-span-2 text-sm text-red-300" role="alert">{error}</p>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={loading || !adminToken}
              className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
            >
              {loading ? "Applying…" : "Apply to all assets"}
            </button>
          </div>
        </form>
      </section>

      {result && (
        <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">
            Batch result — {result.succeeded}/{result.total} succeeded
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-stellar-border text-xs uppercase tracking-wider text-stellar-text-secondary">
                  <th className="py-3 px-3 font-semibold text-white">Asset</th>
                  <th className="py-3 px-3 font-semibold text-white">Status</th>
                  <th className="py-3 px-3 font-semibold text-white">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border/50">
                {result.results.map((r) => (
                  <tr key={r.assetId}>
                    <td className="py-3 px-3 text-white">{r.assetId}</td>
                    <td className="py-3 px-3">
                      <span
                        className={
                          r.success
                            ? "rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300"
                            : "rounded-full bg-red-500/15 px-3 py-1 text-xs text-red-300"
                        }
                      >
                        {r.success ? "Updated" : "Failed"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-stellar-text-secondary">{r.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
