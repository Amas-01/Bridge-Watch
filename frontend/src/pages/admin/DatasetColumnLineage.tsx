import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  createDataset,
  getColumnLineage,
  getDatasetColumns,
  listDatasets,
} from "../../services/api";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";
import type { ColumnLineageView, DatasetColumn, DatasetSummary } from "../../types";

const KIND_BADGE: Record<string, string> = {
  dataset: "bg-stellar-blue/15 text-blue-300",
  column: "bg-emerald-500/15 text-emerald-300",
  transform: "bg-purple-500/15 text-purple-300",
};

export default function DatasetColumnLineage() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [columns, setColumns] = useState<DatasetColumn[]>([]);
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null);
  const [lineage, setLineage] = useState<ColumnLineageView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    displayName: "",
    description: "",
    category: "observability",
    sourceDatasetId: "",
    columns: "",
  });

  const loadDatasets = async () => {
    if (!adminToken) {
      setDatasets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await listDatasets(adminToken);
      setDatasets(response.datasets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load datasets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDatasets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminToken]);

  const selectedDataset = useMemo(
    () => datasets.find((d) => d.id === selectedDatasetId) ?? null,
    [datasets, selectedDatasetId]
  );

  const loadColumns = async (datasetId: string) => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const response = await getDatasetColumns(adminToken, datasetId);
      setColumns(response.columns);
      setSelectedColumnId(null);
      setLineage(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load columns");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDataset = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    if (datasetId) {
      void loadColumns(datasetId);
    } else {
      setColumns([]);
      setLineage(null);
    }
  };

  const handleSelectColumn = async (columnId: string) => {
    setSelectedColumnId(columnId);
    if (!columnId || !selectedDatasetId) {
      setLineage(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const view = await getColumnLineage(adminToken, selectedDatasetId, columnId);
      setLineage(view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load lineage");
      setLineage(null);
    } finally {
      setLoading(false);
    }
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
      const columnsPayload = form.columns
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => ({ name }));
      await createDataset(adminToken, {
        name: form.name,
        displayName: form.displayName,
        description: form.description || undefined,
        category: form.category,
        sourceDatasetId: form.sourceDatasetId || undefined,
        columns: columnsPayload,
      });
      setForm({ name: "", displayName: "", description: "", category: "observability", sourceDatasetId: "", columns: "" });
      await loadDatasets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create dataset");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Admin</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Dataset column lineage</h1>
        <p className="mt-2 max-w-2xl text-stellar-text-secondary">
          Explore how dataset columns flow from source to transformed output, and
          trace each column's provenance through the pipeline.
        </p>
      </header>

      {!adminToken && (
        <div className="rounded-2xl border border-stellar-border bg-stellar-card/80 p-6">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">
              Admin or bootstrap token
            </span>
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

      <section className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Datasets</h2>
              <p className="mt-1 text-sm text-stellar-text-secondary">
                Select a dataset to inspect its columns and column lineage.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDatasets()}
              className="rounded-full border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary transition hover:border-stellar-blue hover:text-white"
            >
              Refresh
            </button>
          </div>

          <div className="mt-6 space-y-3">
            {datasets.length === 0 && (
              <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
                {adminToken ? "No datasets found." : "Add an admin token to load datasets."}
              </div>
            )}
            {datasets.map((dataset) => (
              <button
                key={dataset.id}
                type="button"
                onClick={() => handleSelectDataset(dataset.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  selectedDatasetId === dataset.id
                    ? "border-stellar-blue bg-stellar-blue/10"
                    : "border-stellar-border bg-stellar-dark/70 hover:border-stellar-blue"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-white">{dataset.displayName}</p>
                    <p className="text-sm text-stellar-text-secondary">{dataset.name}</p>
                  </div>
                  <span className="rounded-full border border-stellar-border px-3 py-1 text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
                    {dataset.columnCount} cols
                  </span>
                </div>
                {dataset.description && (
                  <p className="mt-2 text-sm text-stellar-text-secondary">
                    {dataset.description}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <h2 className="text-xl font-semibold text-white">
            {selectedDataset ? `${selectedDataset.displayName} columns` : "Columns"}
          </h2>
          {selectedDatasetId && (
            <p className="mt-1 text-sm text-stellar-text-secondary">
              Pick a column to view its full lineage graph.
            </p>
          )}

          {!selectedDatasetId ? (
            <div className="mt-6 rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
              Select a dataset on the left to view its columns.
            </div>
          ) : (
            <div className="mt-6 space-y-2">
              {columns.length === 0 && (
                <div className="rounded-2xl border border-dashed border-stellar-border px-4 py-8 text-center text-sm text-stellar-text-secondary">
                  No columns defined for this dataset.
                </div>
              )}
              {columns.map((column) => (
                <button
                  key={column.id}
                  type="button"
                  onClick={() => void handleSelectColumn(column.id)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                    selectedColumnId === column.id
                      ? "border-stellar-blue bg-stellar-blue/10"
                      : "border-stellar-border bg-stellar-dark/70 hover:border-stellar-blue"
                  }`}
                >
                  <span className="font-medium text-white">{column.name}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-stellar-text-secondary">
                    {column.dataType ?? "unknown"} {column.isPrimaryKey ? "· PK" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {lineage && (
        <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <h2 className="text-xl font-semibold text-white">
            Lineage: {lineage.columnName}
          </h2>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            {lineage.datasetName} · {lineage.nodes.length} nodes · {lineage.edges.length} edges ·
            generated {new Date(lineage.generatedAt).toLocaleString()}
          </p>

          <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lineage.nodes.map((node) => (
              <div
                key={node.id}
                className="rounded-2xl border border-stellar-border bg-stellar-dark/70 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white">{node.name}</span>
                  <span className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${KIND_BADGE[node.kind] ?? "bg-stellar-border/40 text-stellar-text-secondary"}`}>
                    {node.kind}
                  </span>
                </div>
                {node.dataType && (
                  <p className="mt-1 text-xs text-stellar-text-secondary">
                    type: {node.dataType}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="text-xl font-semibold text-white">Create dataset</h2>
        <p className="mt-1 text-sm text-stellar-text-secondary">
          Register a new dataset (optionally mirror lineage from an existing one).
        </p>
        <form onSubmit={handleCreate} className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
                placeholder="asset_master"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Display name</span>
              <input
                type="text"
                value={form.displayName}
                onChange={(event) => setForm((c) => ({ ...c, displayName: event.target.value }))}
                placeholder="Asset Master"
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Category</span>
              <input
                type="text"
                value={form.category}
                onChange={(event) => setForm((c) => ({ ...c, category: event.target.value }))}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-white">Source dataset (mirror lineage)</span>
              <select
                value={form.sourceDatasetId}
                onChange={(event) => setForm((c) => ({ ...c, sourceDatasetId: event.target.value }))}
                className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
              >
                <option value="">None</option>
                {datasets.map((d) => (
                  <option key={d.id} value={d.id}>{d.displayName}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Columns (comma separated)</span>
            <input
              type="text"
              value={form.columns}
              onChange={(event) => setForm((c) => ({ ...c, columns: event.target.value }))}
              placeholder="symbol, name, issuer"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Processing..." : "Create dataset"}
          </button>
        </form>
      </section>
    </div>
  );
}
