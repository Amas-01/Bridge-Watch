import { useEffect, useMemo, useState } from "react";
import {
  type ChartAnnotation,
  type ChartAnnotationInput,
} from "../../hooks/useChartAnnotations";

type ChartAnnotationPanelProps = {
  symbol: string;
  annotations: ChartAnnotation[];
  defaultTimestamp: string;
  addAnnotation: (input: ChartAnnotationInput) => ChartAnnotation;
  updateAnnotation: (id: string, input: ChartAnnotationInput) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  exportAnnotations: () => string;
};

const DEFAULT_COLOR = "#3b82f6";

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromLocalDateTimeInput(value: string) {
  if (!value) {
    return new Date().toISOString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }

  return date.toISOString();
}

export default function ChartAnnotationPanel({
  symbol,
  annotations,
  defaultTimestamp,
  addAnnotation,
  updateAnnotation,
  removeAnnotation,
  clearAnnotations,
  exportAnnotations,
}: ChartAnnotationPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState<ChartAnnotationInput["kind"]>("note");
  const [label, setLabel] = useState("");
  const [timestamp, setTimestamp] = useState(defaultTimestamp);
  const [notes, setNotes] = useState("");
  const [color, setColor] = useState(DEFAULT_COLOR);

  const canSubmit = label.trim().length > 0 && timestamp.length > 0;

  const editingAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.id === editingId) ?? null,
    [annotations, editingId]
  );

  useEffect(() => {
    if (editingId) return;
    setTimestamp(defaultTimestamp);
  }, [defaultTimestamp, editingId]);

  function resetForm(nextTimestamp = defaultTimestamp) {
    setEditingId(null);
    setKind("note");
    setLabel("");
    setTimestamp(nextTimestamp);
    setNotes("");
    setColor(DEFAULT_COLOR);
  }

  function submitForm() {
    if (!canSubmit) return;

    const payload: ChartAnnotationInput = {
      kind,
      label: label.trim(),
      timestamp,
      notes,
      color,
    };

    if (editingId) {
      updateAnnotation(editingId, payload);
    } else {
      addAnnotation(payload);
    }

    resetForm(timestamp);
  }

  function startEditing(annotation: ChartAnnotation) {
    setEditingId(annotation.id);
    setKind(annotation.kind);
    setLabel(annotation.label);
    setTimestamp(annotation.timestamp);
    setNotes(annotation.notes);
    setColor(annotation.color);
  }

  function downloadAnnotations() {
    const blob = new Blob([exportAnnotations()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${symbol.toLowerCase()}-annotations.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="rounded-lg border border-stellar-border bg-stellar-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Chart annotations</h3>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            Mark milestones, notes, and comparison labels directly from the asset chart.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadAnnotations}
            className="rounded-md border border-stellar-border px-3 py-2 text-sm text-white hover:bg-stellar-border"
          >
            Export
          </button>
          <button
            type="button"
            onClick={clearAnnotations}
            className="rounded-md border border-stellar-border px-3 py-2 text-sm text-stellar-text-secondary hover:text-white"
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm text-stellar-text-secondary">
              <span className="block text-white">Type</span>
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as ChartAnnotationInput["kind"])}
                className="w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              >
                <option value="note">Note</option>
                <option value="marker">Marker</option>
                <option value="comparison">Comparison</option>
              </select>
            </label>
            <label className="space-y-2 text-sm text-stellar-text-secondary">
              <span className="block text-white">Anchor time</span>
              <input
                type="datetime-local"
                value={toLocalDateTimeInput(timestamp)}
                onChange={(event) => setTimestamp(fromLocalDateTimeInput(event.target.value))}
                className="w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm text-stellar-text-secondary">
            <span className="block text-white">Label</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Add a short annotation label"
              className="w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white placeholder:text-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            />
          </label>

          <label className="space-y-2 text-sm text-stellar-text-secondary">
            <span className="block text-white">Notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              placeholder="Add contextual notes for the chart review"
              className="w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white placeholder:text-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-stellar-text-secondary">
              <span className="text-white">Color</span>
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-9 w-12 rounded border border-stellar-border bg-transparent"
              />
            </label>

            <button
              type="button"
              onClick={submitForm}
              disabled={!canSubmit}
              className="rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {editingId ? "Update annotation" : "Add annotation"}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => resetForm(defaultTimestamp)}
                className="rounded-md border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary hover:text-white"
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          {editingAnnotation ? (
            <p className="text-xs text-stellar-text-secondary">
              Editing {editingAnnotation.kind} from {editingAnnotation.timestamp}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-stellar-border/80 bg-stellar-dark/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">Saved annotations</h4>
            <span className="text-xs text-stellar-text-secondary">{annotations.length} total</span>
          </div>

          {annotations.length === 0 ? (
            <p className="text-sm text-stellar-text-secondary">
              Save your first note to track chart decisions over time.
            </p>
          ) : (
            <ul className="space-y-3">
              {annotations.map((annotation) => (
                <li key={annotation.id} className="rounded-md border border-stellar-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: annotation.color }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium text-white">{annotation.label}</span>
                      <span className="rounded-full border border-stellar-border px-2 py-0.5 text-[11px] uppercase tracking-wider text-stellar-text-secondary">
                        {annotation.kind}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(annotation)}
                        className="text-xs text-stellar-blue hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => removeAnnotation(annotation.id)}
                        className="text-xs text-red-300 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {annotation.notes ? (
                    <p className="mt-2 text-sm text-stellar-text-secondary">{annotation.notes}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-stellar-text-secondary">{annotation.timestamp}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
