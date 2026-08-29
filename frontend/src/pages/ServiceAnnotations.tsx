import { useState } from "react";
import {
  useServiceAnnotations,
  useCreateServiceAnnotation,
  useUpdateServiceAnnotation,
  useDeleteServiceAnnotation,
} from "../hooks/useServiceAnnotations";
import { SkeletonCard } from "../components/Skeleton";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const ms = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface AnnotationFormProps {
  initial?: {
    serviceName: string;
    entityType: string;
    entityId?: string;
    content: string;
    startTime?: string;
    endTime?: string;
  };
  onSave: (data: {
    serviceName: string;
    entityType: string;
    entityId?: string;
    content: string;
    startTime?: string;
    endTime?: string;
  }) => void;
  onCancel: () => void;
  saving: boolean;
}

function useFormField(initialValue: string) {
  const [value, setValue] = useState(initialValue);
  return {
    value,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
    ) => setValue(e.target.value),
    setValue,
  };
}

function AnnotationForm({ initial, onSave, onCancel, saving }: AnnotationFormProps) {
  const serviceName = useFormField(initial?.serviceName ?? "");
  const entityType = useFormField(initial?.entityType ?? "source");
  const entityId = useFormField(initial?.entityId ?? "");
  const content = useFormField(initial?.content ?? "");
  const startTime = useFormField(initial?.startTime ?? "");
  const endTime = useFormField(initial?.endTime ?? "");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      serviceName: serviceName.value,
      entityType: entityType.value,
      entityId: entityId.value || undefined,
      content: content.value,
      startTime: startTime.value || undefined,
      endTime: endTime.value || undefined,
    });
  }

  const isValid = serviceName.value.trim() && content.value.trim();

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="ann-service-name" className="block text-sm font-medium text-stellar-text-primary mb-1">
          Service Name <span className="text-red-400">*</span>
        </label>
        <input
          id="ann-service-name"
          type="text"
          value={serviceName.value}
          onChange={serviceName.onChange}
          placeholder="e.g. price-service, horizon"
          required
          className="w-full rounded border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white placeholder-stellar-text-secondary focus:outline-none focus:ring-1 focus:ring-stellar-blue"
        />
      </div>

      <div>
        <label htmlFor="ann-entity-type" className="block text-sm font-medium text-stellar-text-primary mb-1">
          Entity Type
        </label>
        <select
          id="ann-entity-type"
          value={entityType.value}
          onChange={entityType.onChange}
          className="w-full rounded border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-stellar-blue"
        >
          <option value="source">Source</option>
          <option value="bridge">Bridge</option>
          <option value="asset">Asset</option>
          <option value="contract">Contract</option>
          <option value="system">System</option>
        </select>
      </div>

      <div>
        <label htmlFor="ann-entity-id" className="block text-sm font-medium text-stellar-text-primary mb-1">
          Entity ID
        </label>
        <input
          id="ann-entity-id"
          type="text"
          value={entityId.value}
          onChange={entityId.onChange}
          placeholder="Optional entity identifier"
          className="w-full rounded border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white placeholder-stellar-text-secondary focus:outline-none focus:ring-1 focus:ring-stellar-blue"
        />
      </div>

      <div>
        <label htmlFor="ann-content" className="block text-sm font-medium text-stellar-text-primary mb-1">
          Content <span className="text-red-400">*</span>
        </label>
        <textarea
          id="ann-content"
          rows={3}
          value={content.value}
          onChange={content.onChange}
          placeholder="Annotation text"
          required
          className="w-full rounded border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white placeholder-stellar-text-secondary focus:outline-none focus:ring-1 focus:ring-stellar-blue"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="ann-start-time" className="block text-sm font-medium text-stellar-text-primary mb-1">
            Start Time
          </label>
          <input
            id="ann-start-time"
            type="datetime-local"
            value={startTime.value}
            onChange={startTime.onChange}
            className="w-full rounded border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-stellar-blue"
          />
        </div>
        <div>
          <label htmlFor="ann-end-time" className="block text-sm font-medium text-stellar-text-primary mb-1">
            End Time
          </label>
          <input
            id="ann-end-time"
            type="datetime-local"
            value={endTime.value}
            onChange={endTime.onChange}
            className="w-full rounded border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-stellar-blue"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-stellar-border px-4 py-2 text-sm text-stellar-text-secondary hover:text-white transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!isValid || saving}
          className="rounded bg-stellar-blue px-4 py-2 text-sm font-medium text-white hover:bg-stellar-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {saving ? "Saving..." : initial ? "Update Annotation" : "Create Annotation"}
        </button>
      </div>
    </form>
  );
}

export default function ServiceAnnotations() {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    serviceName: string;
    entityType: string;
    entityId?: string;
    content: string;
    startTime?: string;
    endTime?: string;
  } | null>(null);
  const [author, setAuthor] = useState("operator");

  const { data: annotations = [], isLoading, error, refetch } = useServiceAnnotations();
  const createMutation = useCreateServiceAnnotation();
  const updateMutation = useUpdateServiceAnnotation();
  const deleteMutation = useDeleteServiceAnnotation();

  function handleCreate(data: {
    serviceName: string;
    entityType: string;
    entityId?: string;
    content: string;
    startTime?: string;
    endTime?: string;
  }) {
    createMutation.mutate(
      { ...data, author },
      {
        onSuccess: () => {
          setShowForm(false);
        },
      }
    );
  }

  function handleEditStart(ann: NonNullable<typeof annotations>[number]) {
    setEditingId(ann.id);
    setEditData({
      serviceName: ann.serviceName,
      entityType: ann.entityType,
      entityId: ann.entityId ?? undefined,
      content: ann.content,
      startTime: ann.startTime ?? undefined,
      endTime: ann.endTime ?? undefined,
    });
  }

  function handleEditSave(data: {
    serviceName: string;
    entityType: string;
    entityId?: string;
    content: string;
    startTime?: string;
    endTime?: string;
  }) {
    if (!editingId) return;
    updateMutation.mutate(
      {
        id: editingId,
        input: {
          actor: author,
          content: data.content,
          startTime: data.startTime ?? null,
          endTime: data.endTime ?? null,
        },
      },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditData(null);
        },
      }
    );
  }

  function handleDelete(id: string) {
    if (window.confirm("Are you sure you want to delete this annotation?")) {
      deleteMutation.mutate(id);
    }
  }

  function handleCancel() {
    setShowForm(false);
    setEditingId(null);
    setEditData(null);
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-stellar-text-primary">Service Annotations</h1>
          <p className="mt-2 text-stellar-text-secondary">
            Create and manage annotations tied to services and time ranges.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-stellar-text-secondary">
            <label htmlFor="ann-author">Author:</label>
            <input
              id="ann-author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="w-32 rounded border border-stellar-border bg-stellar-dark px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-stellar-blue"
            />
          </div>
          {!showForm && !editingId && (
            <button
              onClick={() => setShowForm(true)}
              className="rounded bg-stellar-blue px-4 py-2 text-sm font-medium text-white hover:bg-stellar-blue/80 transition"
            >
              + New Annotation
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-700 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          {error instanceof Error ? error.message : "Failed to load annotations"}
        </div>
      )}

      {showForm && (
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-stellar-text-primary">New Annotation</h2>
          <AnnotationForm onSave={handleCreate} onCancel={handleCancel} saving={isSaving} />
        </div>
      )}

      {editingId && editData && (
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-stellar-text-primary">Edit Annotation</h2>
          <AnnotationForm
            initial={editData}
            onSave={handleEditSave}
            onCancel={handleCancel}
            saving={isSaving}
          />
        </div>
      )}

      <div className="rounded-lg border border-stellar-border bg-stellar-card">
        <div className="px-6 py-4 border-b border-stellar-border">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stellar-text-primary">
              Annotations
              {annotations && annotations.length > 0 && (
                <span className="ml-2 text-sm font-normal text-stellar-text-secondary">
                  ({annotations.length})
                </span>
              )}
            </h2>
            <button
              onClick={() => refetch()}
              className="text-xs text-stellar-text-secondary hover:text-white transition"
              aria-label="Refresh annotations"
            >
              Refresh
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} rows={2} ariaLabel={`Loading annotation ${i}`} />
            ))}
          </div>
        ) : !annotations || annotations.length === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-stellar-text-secondary">
              No annotations found. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Service annotations list</caption>
              <thead>
                <tr className="text-left text-stellar-text-secondary border-b border-stellar-border">
                  <th scope="col" className="px-6 py-3">Service</th>
                  <th scope="col" className="px-6 py-3">Entity</th>
                  <th scope="col" className="px-6 py-3">Content</th>
                  <th scope="col" className="px-6 py-3">Author</th>
                  <th scope="col" className="px-6 py-3">Time Range</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3">Created</th>
                  <th scope="col" className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stellar-border">
                {annotations.map((ann) => (
                  <tr key={ann.id} className="hover:bg-stellar-dark/40">
                    <td className="px-6 py-3 font-medium text-stellar-text-primary">
                      {ann.serviceName}
                    </td>
                    <td className="px-6 py-3">
                      <span className="text-xs text-stellar-text-secondary">{ann.entityType}</span>
                      {ann.entityId && (
                        <span className="ml-1 font-mono text-xs text-stellar-text-secondary">
                          ({ann.entityId})
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 max-w-xs truncate text-stellar-text-secondary">
                      {ann.content}
                    </td>
                    <td className="px-6 py-3 text-stellar-text-secondary">{ann.author}</td>
                    <td className="px-6 py-3 text-xs text-stellar-text-secondary whitespace-nowrap">
                      {ann.startTime ? formatDate(ann.startTime) : "—"}
                      <span className="mx-1">→</span>
                      {ann.endTime ? formatDate(ann.endTime) : "∞"}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          ann.active
                            ? "bg-green-900/30 text-green-400"
                            : "bg-stellar-border text-stellar-text-secondary"
                        }`}
                      >
                        {ann.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-stellar-text-secondary whitespace-nowrap">
                      {timeAgo(ann.createdAt)}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditStart(ann)}
                          className="text-xs text-stellar-blue hover:text-stellar-blue/80 transition"
                          aria-label={`Edit annotation for ${ann.serviceName}`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(ann.id)}
                          className="text-xs text-red-400 hover:text-red-300 transition"
                          aria-label={`Delete annotation for ${ann.serviceName}`}
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
      </div>
    </div>
  );
}
