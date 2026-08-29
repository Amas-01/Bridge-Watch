import { useEffect, useState, type FormEvent } from "react";
import {
  createValidationPreview,
  getValidationPreviewStatus,
  listValidationPreviews,
} from "../../services/api";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { ImportValidationPreview } from "../../types";

const DATA_TYPES = ["asset", "bridge", "priceRecord", "healthScore", "liquiditySnapshot", "alertRule"];

export default function ImportValidationPreview() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );
  const [previews, setPreviews] = useState<ImportValidationPreview[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataType, setDataType] = useState(DATA_TYPES[0]);
  const [rowsText, setRowsText] = useState(
    '[{ "symbol": "USDC", "name": "USD Coin", "asset_type": "credit_alphanum4", "issuer": null }]'
  );
  const [preview, setPreview] = useState<ImportValidationPreview | null>(null);

  const load = async () => {
    if (!adminToken) return;
    setError(null);
    try {
      const [previewRes, statusRes] = await Promise.all([
        listValidationPreviews(adminToken),
        getValidationPreviewStatus(adminToken),
      ]);
      setPreviews(previewRes.previews);
      setCounts(statusRes.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load previews");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const handleRun = async (event: FormEvent) => {
    event.preventDefault();
    if (!adminToken) {
      setError("Enter an admin API key first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let rows: Array<Record<string, unknown>>;
      try {
        rows = JSON.parse(rowsText) as Array<Record<string, unknown>>;
        if (!Array.isArray(rows)) throw new Error("must be an array");
      } catch {
        throw new Error("Rows must be valid JSON array");
      }
      const response = await createValidationPreview(adminToken, { dataType, rows });
      setPreview(response.preview);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run preview");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Import validation preview</h1>
        <p className="mt-2 max-w-2xl text-stellar-text-secondary">
          Run your validation rules against an inbound dataset before committing it,
          and review per-row errors and a data quality score without persisting the
          data.
        </p>
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

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="text-xl font-semibold text-white">Run a preview</h2>
        <form onSubmit={handleRun} className="mt-6 space-y-5">
          <div>
            <span className="mb-2 block text-sm font-medium text-white">Data type</span>
            <div className="flex flex-wrap gap-2">
              {DATA_TYPES.map((dt) => (
                <button
                  key={dt}
                  type="button"
                  onClick={() => setDataType(dt)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    dataType === dt
                      ? "border-stellar-blue bg-stellar-blue/10 text-white"
                      : "border-stellar-border bg-stellar-dark text-stellar-text-secondary hover:border-stellar-blue"
                  }`}
                >
                  {dt}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Rows (JSON array)</span>
            <textarea
              value={rowsText}
              onChange={(event) => setRowsText(event.target.value)}
              rows={6}
              spellCheck={false}
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Validating..." : "Run validation preview"}
          </button>
        </form>

        {preview && (
          <div className="mt-6 rounded-2xl border border-stellar-border bg-stellar-dark/70 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-lg font-medium text-white">Preview result</h3>
              <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                preview.invalidCount > 0 ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"
              }`}>
                {preview.invalidCount > 0 ? "Failed" : "Passed"}
              </span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {[
                { label: "Rows", value: preview.rowCount },
                { label: "Valid", value: preview.validCount },
                { label: "Invalid", value: preview.invalidCount },
                { label: "Warnings", value: preview.warningCount },
                { label: "Quality score", value: preview.dataQualityScore },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-stellar-border bg-stellar-card/60 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">{stat.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{stat.value}</p>
                </div>
              ))}
            </div>
            {preview.errors.length > 0 && (
              <div className="mt-4">
                <p className="text-sm font-medium text-white">Errors</p>
                <pre className="mt-2 overflow-x-auto rounded-xl border border-stellar-border bg-stellar-dark p-3 text-xs text-red-300">
                  {JSON.stringify(preview.errors.slice(0, 50), null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-white">Previous previews</h2>
            <p className="mt-1 text-sm text-stellar-text-secondary">
              {Object.keys(counts).length > 0 && (
                <span>Failed by type: {Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · ")}</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
          >
            Refresh
          </button>
        </div>
        <div className="mt-6 space-y-3">
          {previews.length === 0 && (
            <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
              No previews yet.
            </div>
          )}
          {previews.map((p) => (
            <div key={p.id} className="rounded-2xl border border-stellar-border bg-stellar-dark/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium text-white">{p.dataType}</p>
                  <p className="text-sm text-stellar-text-secondary">
                    {new Date(p.createdAt).toLocaleString()} · {p.rowCount} rows · {p.invalidCount} invalid
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                  p.invalidCount > 0 ? "bg-red-500/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"
                }`}>
                  {p.invalidCount > 0 ? "Failed" : "Passed"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
