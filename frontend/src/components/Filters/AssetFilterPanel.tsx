import { useMemo, useState } from "react";
import type { FilterStatus } from "../../types";
import type {
  DashboardFilterPreset,
  DashboardFilters,
  DashboardTimeRangePreset,
} from "../../hooks/useDashboardFilters";

interface AssetFilterPanelProps {
  readonly assets: string[];
  readonly bridges: string[];
  readonly filters: DashboardFilters;
  readonly savedPresets: DashboardFilterPreset[];
  readonly hasActiveFilters: boolean;
  readonly onToggleAsset: (asset: string) => void;
  readonly onToggleBridge: (bridge: string) => void;
  readonly onStatusChange: (status: FilterStatus) => void;
  readonly onTimeRangeChange: (timeRange: DashboardTimeRangePreset) => void;
  readonly onClearAll: () => void;
  readonly onSavePreset: (name: string) => boolean;
  readonly onApplyPreset: (id: string) => void;
  readonly onDeletePreset: (id: string) => void;
}

const STATUS_OPTIONS: Array<{ value: FilterStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "healthy", label: "Healthy" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

const TIME_RANGE_OPTIONS: Array<{ value: DashboardTimeRangePreset; label: string }> = [
  { value: "all", label: "All time" },
  { value: "24h", label: "Last 24h" },
  { value: "7d", label: "Last 7d" },
  { value: "30d", label: "Last 30d" },
];

function FilterSection({
  id,
  title,
  expanded,
  onToggle,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="border-b border-stellar-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`${id}-content`}
        className="w-full flex items-center justify-between gap-2 py-3 px-1 text-sm font-medium text-stellar-text-primary hover:text-white transition-colors"
      >
        <span>{title}</span>
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>
      {expanded && (
        <div id={`${id}-content`} className="pb-3 px-1 space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

function SelectionGroup({
  title,
  items,
  selected,
  groupId,
  onToggle,
}: {
  readonly title: string;
  readonly items: string[];
  readonly selected: string[];
  readonly groupId: string;
  readonly onToggle: (value: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-stellar-text-primary">{title}</legend>
      <div className="max-h-36 overflow-auto rounded-md border border-stellar-border bg-stellar-dark p-2">
        {items.length === 0 ? (
          <p className="text-xs text-stellar-text-secondary">No options available</p>
        ) : (
          <ul className="space-y-1">
            {items.map((item) => {
              const id = `${groupId}-${item}`;
              const checked = selected.includes(item);
              return (
                <li key={item}>
                  <label htmlFor={id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-stellar-text-primary hover:bg-stellar-card">
                    <input
                      id={id}
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(item)}
                      className="h-4 w-4 rounded border-stellar-border bg-stellar-card text-stellar-blue focus:ring-stellar-blue"
                    />
                    <span>{item}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </fieldset>
  );
}

export default function AssetFilterPanel({
  assets,
  bridges,
  filters,
  savedPresets,
  hasActiveFilters,
  onToggleAsset,
  onToggleBridge,
  onStatusChange,
  onTimeRangeChange,
  onClearAll,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
}: AssetFilterPanelProps) {
  const [presetName, setPresetName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    filters: true,
    presets: true,
  });

  const selectedPreset = useMemo(
    () => savedPresets.find((preset) => preset.id === selectedPresetId) ?? null,
    [savedPresets, selectedPresetId],
  );

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }));
  };

  function handleSavePreset() {
    const wasSaved = onSavePreset(presetName);
    if (wasSaved) {
      setPresetName("");
    }
  }

  function handleApplyPreset() {
    if (!selectedPresetId) return;
    onApplyPreset(selectedPresetId);
  }

  function handleDeletePreset() {
    if (!selectedPreset) return;
    onDeletePreset(selectedPreset.id);
    setSelectedPresetId("");
  }

  return (
    <aside
      className="w-full md:w-80 border-r border-stellar-border bg-stellar-card rounded-lg md:rounded-none"
      aria-label="Dashboard filters"
    >
      <div className="p-4 space-y-1">
        <h3 className="text-base font-semibold text-stellar-text-primary">Filters</h3>
        <button
          type="button"
          onClick={onClearAll}
          disabled={!hasActiveFilters}
          className="text-xs text-stellar-text-secondary hover:text-stellar-text-primary disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
        >
          Clear all
        </button>

        <div className="space-y-4 mt-4 divide-y divide-stellar-border">
          <FilterSection
            id="filter-assets"
            title="Assets"
            expanded={expandedSections.filters ?? true}
            onToggle={() => toggleSection("filters")}
          >
            <SelectionGroup
              title=""
              items={assets}
              selected={filters.assets}
              groupId="dashboard-filter-asset"
              onToggle={onToggleAsset}
            />
          </FilterSection>

          <FilterSection
            id="filter-bridges"
            title="Bridges"
            expanded={expandedSections.filters ?? true}
            onToggle={() => toggleSection("filters")}
          >
            <SelectionGroup
              title=""
              items={bridges}
              selected={filters.bridges}
              groupId="dashboard-filter-bridge"
              onToggle={onToggleBridge}
            />
          </FilterSection>

          <div className="pt-3">
            <label htmlFor="dashboard-status-filter" className="block text-sm font-medium text-stellar-text-primary mb-2">
              Status
            </label>
            <select
              id="dashboard-status-filter"
              value={filters.status}
              onChange={(event) => onStatusChange(event.target.value as FilterStatus)}
              className="w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="pt-3">
            <fieldset>
              <legend className="text-sm font-medium text-stellar-text-primary mb-2 block">Time range</legend>
              <div className="grid grid-cols-2 gap-2">
                {TIME_RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onTimeRangeChange(option.value)}
                    aria-pressed={filters.timeRange === option.value}
                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                      filters.timeRange === option.value
                        ? "border-stellar-blue bg-stellar-blue/20 text-stellar-text-primary"
                        : "border-stellar-border bg-stellar-dark text-stellar-text-secondary hover:text-stellar-text-primary"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <FilterSection
            id="filter-presets"
            title="Presets"
            expanded={expandedSections.presets ?? true}
            onToggle={() => toggleSection("presets")}
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="dashboard-preset-name" className="block text-xs font-medium text-stellar-text-primary">
                  Save current filters
                </label>
                <div className="flex gap-2">
                  <input
                    id="dashboard-preset-name"
                    type="text"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="Preset name"
                    className="flex-1 rounded-md border border-stellar-border bg-stellar-dark px-2 py-1.5 text-xs text-stellar-text-primary placeholder:text-stellar-text-secondary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                  />
                  <button
                    type="button"
                    onClick={handleSavePreset}
                    className="rounded-md border border-stellar-border px-2 py-1.5 text-xs text-stellar-text-secondary hover:text-stellar-text-primary transition-colors"
                  >
                    Save
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="dashboard-saved-presets" className="block text-xs font-medium text-stellar-text-primary">
                  Saved presets
                </label>
                <select
                  id="dashboard-saved-presets"
                  value={selectedPresetId}
                  onChange={(event) => setSelectedPresetId(event.target.value)}
                  className="w-full rounded-md border border-stellar-border bg-stellar-dark px-2 py-1.5 text-xs text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                >
                  <option value="">Select preset</option>
                  {savedPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleApplyPreset}
                  disabled={!selectedPreset}
                  className="flex-1 rounded-md border border-stellar-border px-2 py-1.5 text-xs text-stellar-text-secondary hover:text-stellar-text-primary disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={handleDeletePreset}
                  disabled={!selectedPreset}
                  className="flex-1 rounded-md border border-stellar-border px-2 py-1.5 text-xs text-stellar-text-secondary hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </FilterSection>
        </div>
      </div>
    </aside>
  );
}
