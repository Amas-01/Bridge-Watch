import { useRef, useState } from "react";
import { useTimeRange } from "../../hooks/useTimeRange";
import {
  formatRangeLabel,
  TIME_RANGE_PRESETS,
  type TimeRangePreset,
  type TimeRangeSelection,
} from "../../utils/timeRange";
import DateRangePicker from "./DateRangePicker";

interface TimeRangeSelectorProps {
  chartId: string;
  title?: string;
  className?: string;
  showApplyGlobally?: boolean;
}

function getPresetFromSelection(
  selection?: TimeRangeSelection
): TimeRangePreset | undefined {
  return selection?.preset;
}

export default function TimeRangeSelector({
  chartId,
  title = "Time range",
  className = "",
  showApplyGlobally = true,
}: TimeRangeSelectorProps) {
  const {
    applyGlobally,
    setApplyGlobally,
    globalSelection,
    setGlobalSelection,
    getChartSelection,
    setChartSelection,
    getEffectiveSelection,
    clearSelection,
    lastSelection,
  } = useTimeRange();

  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const customRangeButtonRef = useRef<HTMLButtonElement>(null);
  const activeSelection = getEffectiveSelection(chartId);
  const chartSelection = getChartSelection(chartId);
  const activePreset = getPresetFromSelection(activeSelection);

  const applySelection = (selection?: TimeRangeSelection) => {
    if (applyGlobally) {
      setGlobalSelection(selection);
      return;
    }

    setChartSelection(chartId, selection);
  };

  return (
    <div className={`rounded-md border border-stellar-border p-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-stellar-text-secondary">
            Active: {formatRangeLabel(activeSelection)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Time range presets">
          {TIME_RANGE_PRESETS.map((preset) => {
            const isActive = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applySelection({ preset: preset.id })}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-stellar-blue/50 ${
                  isActive
                    ? "bg-stellar-blue text-white"
                    : "border border-stellar-border text-stellar-text-secondary hover:text-white"
                }`}
                aria-pressed={isActive}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          ref={customRangeButtonRef}
          type="button"
          onClick={() => setShowCustomPicker((value) => !value)}
          className="rounded border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-stellar-blue/50"
          aria-expanded={showCustomPicker}
        >
          {showCustomPicker ? "Hide custom" : "Custom range"}
        </button>

        {lastSelection ? (
          <button
            type="button"
            onClick={() => applySelection(lastSelection)}
            className="rounded border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-stellar-blue/50"
          >
            Restore last selection
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => clearSelection(chartId)}
          className="rounded border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-stellar-blue/50"
        >
          Clear selection
        </button>
      </div>

      {showApplyGlobally ? (
        <label className="mt-3 inline-flex items-center gap-2 text-xs text-stellar-text-secondary">
          <input
            type="checkbox"
            checked={applyGlobally}
            onChange={(event) => setApplyGlobally(event.target.checked)}
            className="h-4 w-4 rounded border-stellar-border bg-stellar-dark"
          />
          Apply to all charts
        </label>
      ) : null}

      {!applyGlobally ? (
        <p className="mt-2 text-xs text-stellar-text-secondary">
          Chart scope: {chartSelection ? "This chart only" : "No range selected"}
        </p>
      ) : globalSelection ? (
        <p className="mt-2 text-xs text-stellar-text-secondary">Global scope enabled</p>
      ) : null}

      {showCustomPicker ? (
        <DateRangePicker
          value={activeSelection}
          onApply={(selection) => {
            applySelection(selection);
            setShowCustomPicker(false);
          }}
          onClear={() => {
            clearSelection(chartId);
            setShowCustomPicker(false);
          }}
          triggerRef={customRangeButtonRef}
        />
      ) : null}
    </div>
  );
}
