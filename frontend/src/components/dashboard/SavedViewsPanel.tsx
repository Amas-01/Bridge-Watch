import { useState } from "react";
import { useSavedViewsStore, type SavedView } from "../../stores/savedViewsStore";

interface SavedViewsPanelProps {
  onApplyView: (view: SavedView) => void;
  onSaveCurrentView: (name: string, description?: string) => void;
}

export default function SavedViewsPanel({
  onApplyView,
  onSaveCurrentView,
}: SavedViewsPanelProps) {
  const { savedViews, activeViewId, deleteView, setDefault, getShareableUrl } =
    useSavedViewsStore();

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewDescription, setNewViewDescription] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleSave = () => {
    const name = newViewName.trim();
    if (!name) return;
    onSaveCurrentView(name, newViewDescription.trim() || undefined);
    setNewViewName("");
    setNewViewDescription("");
    setShowSaveForm(false);
  };

  const handleCopyLink = async (id: string) => {
    const url = getShareableUrl(id);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      el.style.position = "fixed";
      el.style.left = "-9999px";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    }
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (view: SavedView) => {
    if (window.confirm(`Delete saved view "${view.name}"?`)) {
      deleteView(view.id);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Saved Views
        </h3>
        <button
          onClick={() => setShowSaveForm((prev) => !prev)}
          className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-expanded={showSaveForm}
        >
          {showSaveForm ? "Cancel" : "Save current view"}
        </button>
      </div>

      {showSaveForm && (
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-700 dark:bg-blue-900/30">
          <div className="mb-2">
            <label
              htmlFor="saved-view-name"
              className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              Name <span className="text-red-500" aria-hidden="true">*</span>
            </label>
            <input
              id="saved-view-name"
              type="text"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="e.g. Critical assets only"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              autoFocus
            />
          </div>
          <div className="mb-3">
            <label
              htmlFor="saved-view-description"
              className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300"
            >
              Description (optional)
            </label>
            <input
              id="saved-view-description"
              type="text"
              value={newViewDescription}
              onChange={(e) => setNewViewDescription(e.target.value)}
              placeholder="Short description of this view"
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={!newViewName.trim()}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Save
          </button>
        </div>
      )}

      {savedViews.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500 dark:text-gray-400">
          No saved views yet. Save your current filters and layout to get started.
        </p>
      ) : (
        <ul className="space-y-2">
          {savedViews.map((view) => (
            <li
              key={view.id}
              className={`rounded-md border p-3 transition-colors ${
                activeViewId === view.id
                  ? "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20"
                  : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-700/30"
              }`}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                      {view.name}
                    </span>
                    {view.isDefault && (
                      <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/40 dark:text-green-400">
                        default
                      </span>
                    )}
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                      {view.view}
                    </span>
                  </div>
                  {view.description && (
                    <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                      {view.description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 mt-2">
                <button
                  onClick={() => onApplyView(view)}
                  className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  aria-label={`Apply view: ${view.name}`}
                >
                  Apply
                </button>
                <button
                  onClick={() => setDefault(view.id)}
                  disabled={view.isDefault}
                  className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  aria-label={`Set ${view.name} as default view`}
                >
                  Set default
                </button>
                <button
                  onClick={() => handleCopyLink(view.id)}
                  className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-400"
                  aria-label={`Copy shareable link for view: ${view.name}`}
                >
                  {copiedId === view.id ? "Copied!" : "Copy link"}
                </button>
                <button
                  onClick={() => handleDelete(view)}
                  className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 focus:outline-none focus:ring-1 focus:ring-red-400"
                  aria-label={`Delete saved view: ${view.name}`}
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
