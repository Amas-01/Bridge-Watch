import { useMemo, useState } from "react";
import {
  useCreateSavedMetric,
  useDeleteSavedMetric,
  useSavedMetrics,
  useValidateMetricFormula,
} from "../hooks/useSavedMetrics";

const EXAMPLE_FORMULA = `SELECT bridge_id, COUNT(*) AS verifications
FROM verification_results
WHERE verified_at >= NOW() - INTERVAL '7 days'
GROUP BY bridge_id
ORDER BY verifications DESC`;

export default function CustomMetricBuilder() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [formula, setFormula] = useState(EXAMPLE_FORMULA);
  const [isShared, setIsShared] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const { data: metrics = [], isLoading } = useSavedMetrics();
  const validateMutation = useValidateMetricFormula();
  const createMutation = useCreateSavedMetric();
  const deleteMutation = useDeleteSavedMetric();

  const preview = validateMutation.data?.data?.preview;

  const canSave = useMemo(
    () => name.trim().length > 0 && formula.trim().length > 0 && !createMutation.isPending,
    [name, formula, createMutation.isPending],
  );

  const handleValidate = async () => {
    const result = await validateMutation.mutateAsync(formula);
    if (result.data?.valid) {
      setValidationMessage("Formula is valid");
    } else {
      setValidationMessage(result.data?.errors.join(", ") ?? "Validation failed");
    }
  };

  const handleSave = async () => {
    await createMutation.mutateAsync({
      name,
      description,
      formula,
      isShared,
    });
    setName("");
    setDescription("");
    setValidationMessage("Metric saved");
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-stellar-text-primary">Custom Metric Builder</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Compose read-only SQL metrics, validate against live data, and save for your team.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4 rounded-xl border border-stellar-border bg-stellar-card p-6">
          <div>
            <label htmlFor="metric-name" className="text-sm text-stellar-text-secondary">
              Metric name
            </label>
            <input
              id="metric-name"
              className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Bridge verification rate"
            />
          </div>

          <div>
            <label htmlFor="metric-description" className="text-sm text-stellar-text-secondary">
              Description
            </label>
            <input
              id="metric-description"
              className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-white"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Weekly verification counts by bridge"
            />
          </div>

          <div>
            <label htmlFor="metric-formula" className="text-sm text-stellar-text-secondary">
              Formula (SQL SELECT)
            </label>
            <textarea
              id="metric-formula"
              className="mt-1 h-48 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 font-mono text-sm text-white"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.stopPropagation();
              }}
              spellCheck={false}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-stellar-text-secondary">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
            />
            Share with team
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-md border border-stellar-border px-4 py-2 text-sm text-white hover:bg-stellar-dark"
              onClick={handleValidate}
              disabled={validateMutation.isPending}
            >
              Validate &amp; preview
            </button>
            <button
              type="button"
              className="rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              onClick={handleSave}
              disabled={!canSave}
            >
              Save metric
            </button>
          </div>

          {validationMessage && (
            <p className="text-sm text-stellar-text-secondary">{validationMessage}</p>
          )}

          {preview && (
            <div className="rounded-md border border-stellar-border bg-stellar-dark p-4">
              <p className="text-sm font-medium text-white">Preview ({preview.rowCount} rows)</p>
              <pre className="mt-2 overflow-auto text-xs text-stellar-text-secondary">
                {JSON.stringify(preview.sampleRows, null, 2)}
              </pre>
            </div>
          )}
        </section>

        <aside className="rounded-xl border border-stellar-border bg-stellar-card p-6">
          <h2 className="text-lg font-semibold text-white">Saved metrics</h2>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            See `docs/custom-metric-syntax.md` for query language reference.
          </p>

          {isLoading ? (
            <p className="mt-4 text-sm text-stellar-text-secondary">Loading...</p>
          ) : metrics.length === 0 ? (
            <p className="mt-4 text-sm text-stellar-text-secondary">No saved metrics yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {metrics.map((metric) => (
                <li
                  key={metric.id}
                  className="rounded-md border border-stellar-border bg-stellar-dark p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-white">{metric.name}</p>
                      {metric.description && (
                        <p className="text-xs text-stellar-text-secondary">{metric.description}</p>
                      )}
                      {metric.isShared && (
                        <span className="mt-1 inline-block text-xs text-stellar-blue">Shared</span>
                      )}
                    </div>
                    <button
                      type="button"
                      className="text-xs text-red-400 hover:text-red-300"
                      onClick={() => deleteMutation.mutate(metric.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
