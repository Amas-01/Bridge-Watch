type AssetTagsPanelProps = {
  symbol: string;
  tags: string[];
  draftTagInput: string;
  onDraftTagInputChange: (value: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onSave: () => void;
  onReset: () => void;
  canSave: boolean;
  isSaving: boolean;
  statusText: string;
};

export default function AssetTagsPanel({
  symbol,
  tags,
  draftTagInput,
  onDraftTagInputChange,
  onAddTag,
  onRemoveTag,
  onSave,
  onReset,
  canSave,
  isSaving,
  statusText,
}: AssetTagsPanelProps) {
  return (
    <section className="rounded-lg border border-stellar-border bg-stellar-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Asset tags</h3>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            Organize {symbol} with backend-synced tags for filtering and review.
          </p>
        </div>
        <span className="rounded-full border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary">
          {statusText}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {tags.length > 0 ? (
          tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onRemoveTag(tag)}
              className="rounded-full border border-stellar-border bg-stellar-dark/40 px-3 py-1 text-sm text-white transition-colors hover:border-red-400 hover:text-red-200"
              aria-label={`Remove tag ${tag}`}
              title="Click to remove"
            >
              {tag}
            </button>
          ))
        ) : (
          <p className="text-sm text-stellar-text-secondary">No tags saved yet.</p>
        )}
      </div>

      <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-center">
        <input
          value={draftTagInput}
          onChange={(event) => onDraftTagInputChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddTag();
            }
          }}
          placeholder="Add a tag and press Enter"
          className="flex-1 rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white placeholder:text-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
          aria-label={`Add a tag for ${symbol}`}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAddTag}
            className="rounded-md border border-stellar-border px-3 py-2 text-sm text-white hover:bg-stellar-border"
          >
            Add tag
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded-md border border-stellar-border px-3 py-2 text-sm text-stellar-text-secondary hover:text-white"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave || isSaving}
          className="rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save tags"}
        </button>
        <p className="text-xs text-stellar-text-secondary">
          Tags persist in the asset metadata record and are safe to revisit later.
        </p>
      </div>
    </section>
  );
}

