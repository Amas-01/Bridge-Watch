import { useEffect, useRef, useState } from "react";
import {
  buildPresetShareUrl,
  isDashboardFilterActive,
  type DashboardFilterPreset,
  type DashboardFilters,
} from "../../hooks/useDashboardFilters";

interface FilterPresetsMenuProps {
  readonly filters: DashboardFilters;
  readonly presets: DashboardFilterPreset[];
  readonly onSavePreset: (name: string) => boolean;
  readonly onApplyPreset: (id: string) => void;
  readonly onRenamePreset: (id: string, name: string) => boolean;
  readonly onDeletePreset: (id: string) => void;
  readonly onToggleShared: (id: string, shared: boolean) => void;
  /** Pathname used when building shareable preset links. Defaults to the dashboard. */
  readonly sharePathname?: string;
}

function summarizeFilters(filters: DashboardFilters): string {
  const parts: string[] = [];
  if (filters.assets.length > 0) parts.push(`${filters.assets.length} asset${filters.assets.length > 1 ? "s" : ""}`);
  if (filters.bridges.length > 0) parts.push(`${filters.bridges.length} bridge${filters.bridges.length > 1 ? "s" : ""}`);
  if (filters.status !== "all") parts.push(filters.status);
  if (filters.timeRange !== "all") parts.push(filters.timeRange);
  return parts.length > 0 ? parts.join(" • ") : "No filters";
}

/**
 * Dropdown menu for saving, loading, renaming, deleting and sharing dashboard
 * filter presets. Hooks into the dashboard filter state via the supplied
 * callbacks; preset definitions are persisted by `useDashboardFilters`.
 */
export default function FilterPresetsMenu({
  filters,
  presets,
  onSavePreset,
  onApplyPreset,
  onRenamePreset,
  onDeletePreset,
  onToggleShared,
  sharePathname = "/dashboard",
}: FilterPresetsMenuProps) {
  const [open, setOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const canSaveCurrent = isDashboardFilterActive(filters);

  useEffect(() => {
    if (!open) return;

    function handlePointer(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function handleSave() {
    if (onSavePreset(presetName)) {
      setPresetName("");
    }
  }

  function startRename(preset: DashboardFilterPreset) {
    setEditingId(preset.id);
    setEditingName(preset.name);
  }

  function commitRename() {
    if (editingId && onRenamePreset(editingId, editingName)) {
      setEditingId(null);
      setEditingName("");
    }
  }

  async function handleCopyShareLink(preset: DashboardFilterPreset) {
    const url = buildPresetShareUrl(preset, sharePathname);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(preset.id);
      window.setTimeout(() => setCopiedId((current) => (current === preset.id ? null : current)), 2000);
    } catch {
      // Clipboard may be unavailable (insecure context); fail silently.
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-stellar-border px-4 py-2 text-sm text-white transition-colors hover:bg-stellar-border"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L15 12.414V19a1 1 0 01-1.447.894l-4-2A1 1 0 019 17v-4.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        Presets
        {presets.length > 0 ? (
          <span className="rounded-full bg-stellar-blue/20 px-2 text-xs text-stellar-blue">{presets.length}</span>
        ) : null}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Filter presets"
          className="absolute right-0 z-40 mt-2 w-80 rounded-lg border border-stellar-border bg-stellar-card p-4 shadow-xl"
        >
          <div className="space-y-2">
            <label htmlFor="filter-preset-menu-name" className="block text-xs font-medium text-stellar-text-primary">
              Save current filters
            </label>
            <p className="text-xs text-stellar-text-secondary">{summarizeFilters(filters)}</p>
            <div className="flex gap-2">
              <input
                id="filter-preset-menu-name"
                type="text"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSave();
                }}
                placeholder="Preset name"
                className="flex-1 rounded-md border border-stellar-border bg-stellar-dark px-2 py-1.5 text-xs text-stellar-text-primary placeholder:text-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSaveCurrent || presetName.trim().length === 0}
                className="rounded-md border border-stellar-blue bg-stellar-blue/20 px-3 py-1.5 text-xs text-white transition-colors hover:bg-stellar-blue/30 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Save
              </button>
            </div>
            {!canSaveCurrent ? (
              <p className="text-xs text-stellar-text-secondary">Apply at least one filter to save a preset.</p>
            ) : null}
          </div>

          <div className="my-3 border-t border-stellar-border" />

          <div className="space-y-2">
            <p className="text-xs font-medium text-stellar-text-primary">Saved presets</p>
            {presets.length === 0 ? (
              <p className="text-xs text-stellar-text-secondary">No presets saved yet.</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-auto">
                {presets.map((preset) => (
                  <li
                    key={preset.id}
                    className="rounded-md border border-stellar-border bg-stellar-dark/60 p-2"
                  >
                    {editingId === preset.id ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingName}
                          autoFocus
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") commitRename();
                            if (event.key === "Escape") setEditingId(null);
                          }}
                          aria-label={`Rename ${preset.name}`}
                          className="flex-1 rounded border border-stellar-border bg-stellar-dark px-2 py-1 text-xs text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                        />
                        <button
                          type="button"
                          onClick={commitRename}
                          className="rounded border border-stellar-border px-2 py-1 text-xs text-stellar-text-secondary hover:text-white"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              onApplyPreset(preset.id);
                              setOpen(false);
                            }}
                            className="flex-1 truncate text-left text-sm text-stellar-text-primary hover:text-white"
                            title={`Apply ${preset.name}`}
                          >
                            {preset.name}
                          </button>
                          {preset.shared ? (
                            <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-green-300">
                              Shared
                            </span>
                          ) : (
                            <span className="rounded-full bg-stellar-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-stellar-text-secondary">
                              Private
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-[11px] text-stellar-text-secondary">
                          {summarizeFilters(preset.filters)}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          <button
                            type="button"
                            onClick={() => startRename(preset)}
                            className="text-stellar-text-secondary hover:text-white"
                          >
                            Rename
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleShared(preset.id, !preset.shared)}
                            className="text-stellar-text-secondary hover:text-white"
                          >
                            {preset.shared ? "Make private" : "Make shared"}
                          </button>
                          {preset.shared ? (
                            <button
                              type="button"
                              onClick={() => {
                                void handleCopyShareLink(preset);
                              }}
                              className="text-stellar-blue hover:text-white"
                            >
                              {copiedId === preset.id ? "Copied!" : "Copy link"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => onDeletePreset(preset.id)}
                            className="text-red-300 hover:text-red-200"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
