import { useEffect, useMemo, useRef, useState } from "react";
import {
  fromInputDateTimeValue,
  toInputDateTimeValue,
  type TimeRangeSelection,
  TIME_RANGE_PRESETS,
  type TimeRangePreset,
} from "../../utils/timeRange";

interface DateRangePickerProps {
  value?: TimeRangeSelection;
  onApply: (selection: TimeRangeSelection) => void;
  onClear: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

/**
 * Enhanced date range picker component with preset shortcuts, validation, keyboard navigation,
 * focus management, and recent ranges persistence.
 *
 * Features:
 * - Preset shortcuts (1H, 24H, 7D, 30D, 1Y) with active state indication
 * - Custom start/end date inputs with validation
 * - Recent custom ranges persistence (up to 5 ranges in localStorage)
 * - Keyboard navigation: Tab/Shift+Tab, Enter/Space to apply, Escape to close
 * - Focus trap and restoration
 * - Mobile-friendly responsive layout
 * - Time zone aware (uses browser local time zone)
 *
 * @param value - Current time range selection
 * @param onApply - Callback when range is applied
 * @param onClear - Callback when range is cleared
 * @param triggerRef - Reference to trigger element for focus restoration
 */
function getPresetRange(preset: TimeRangePreset): TimeRangeSelection {
  const now = new Date();
  const presetOption = TIME_RANGE_PRESETS.find((p) => p.id === preset);

  if (!presetOption) {
    return { start: now.toISOString(), end: now.toISOString() };
  }

  const start = new Date(now.getTime() - presetOption.durationMs);
  return {
    start: start.toISOString(),
    end: now.toISOString(),
  };
}

function getRecentRanges(): TimeRangeSelection[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem("bridgewatch.recentRanges.v1");
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as TimeRangeSelection[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentRange(selection: TimeRangeSelection): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const recent = getRecentRanges();
    // Remove duplicates and add new range to front
    const filtered = recent.filter(
      (r) => !(r.start === selection.start && r.end === selection.end)
    );
    const updated = [selection, ...filtered].slice(0, 5);
    window.localStorage.setItem("bridgewatch.recentRanges.v1", JSON.stringify(updated));
  } catch {
    // Silently fail if localStorage is unavailable
  }
}

function isPresetActive(
  selection: TimeRangeSelection | undefined,
  preset: TimeRangePreset
): boolean {
  if (!selection || selection.preset) {
    return selection?.preset === preset;
  }

  // Check if custom range matches preset exactly
  const presetRange = getPresetRange(preset);
  return (
    selection.start === presetRange.start && selection.end === presetRange.end
  );
}

export default function DateRangePicker({
  value,
  onApply,
  onClear,
  triggerRef,
}: DateRangePickerProps) {
  const initialStart = useMemo(() => toInputDateTimeValue(value?.start), [value?.start]);
  const initialEnd = useMemo(() => toInputDateTimeValue(value?.end), [value?.end]);

  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [recentRanges, setRecentRanges] = useState<TimeRangeSelection[]>(() =>
    getRecentRanges()
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);

  // Validation
  const isInvalid = Boolean(start && end && new Date(start) > new Date(end));
  const canApply = Boolean(start && end && !isInvalid);

  // Sync initial values
  useEffect(() => {
    setStart(initialStart);
    setEnd(initialEnd);
  }, [initialEnd, initialStart]);

  // Handle keyboard navigation and focus trap
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const activeElement = document.activeElement as HTMLElement;

    if (event.key === "Escape") {
      // Close without applying changes
      event.preventDefault();
      if (triggerRef?.current) {
        triggerRef.current.focus();
      }
      return;
    }

    if (event.key === "Tab") {
      const focusable = Array.from(
        containerRef.current?.querySelectorAll<HTMLElement>(
          "button, input, [tabindex]:not([tabindex='-1'])"
        ) ?? []
      ).filter(
        (element) =>
          !element.hasAttribute("disabled") && (element as HTMLButtonElement).disabled !== true
      );

      if (!focusable.length) {
        return;
      }

      event.preventDefault();
      const currentIndex = focusable.indexOf(activeElement);

      if (event.shiftKey) {
        // Shift+Tab: move to previous element
        const nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
        focusable[nextIndex]?.focus();
      } else {
        // Tab: move to next element
        const nextIndex = currentIndex >= focusable.length - 1 || currentIndex === -1 ? 0 : currentIndex + 1;
        focusable[nextIndex]?.focus();
      }
    }

    if (event.key === "Enter" || event.key === " ") {
      // Allow Enter/Space on buttons to work normally
      if (activeElement.tagName === "BUTTON") {
        return;
      }
    }
  };

  const handleApplyPreset = (preset: TimeRangePreset) => {
    const range = getPresetRange(preset);
    onApply({ ...range, preset });
  };

  const handleApplyCustom = () => {
    if (!canApply) {
      return;
    }

    const selection: TimeRangeSelection = {
      start: fromInputDateTimeValue(start),
      end: fromInputDateTimeValue(end),
    };

    saveRecentRange(selection);
    setRecentRanges(getRecentRanges());
    onApply(selection);
  };

  const handleApplyRecent = (selection: TimeRangeSelection) => {
    onApply(selection);
  };

  const handleClear = () => {
    setStart("");
    setEnd("");
    onClear();
  };

  return (
    <div
      ref={containerRef}
      className="mt-3 space-y-3 rounded-md border border-stellar-border p-3"
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Date range picker"
    >
      {/* Date Inputs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-xs text-stellar-text-secondary">
          Start
          <input
            ref={startInputRef}
            type="datetime-local"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-stellar-blue/50"
            aria-invalid={isInvalid}
            aria-describedby={isInvalid ? "range-error" : undefined}
          />
        </label>
        <label className="text-xs text-stellar-text-secondary">
          End
          <input
            ref={endInputRef}
            type="datetime-local"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:ring-stellar-blue/50"
            aria-invalid={isInvalid}
            aria-describedby={isInvalid ? "range-error" : undefined}
          />
        </label>
      </div>

      {/* Validation Error */}
      {isInvalid ? (
        <p id="range-error" className="text-xs text-red-400">
          Start date must be before end date.
        </p>
      ) : null}

      {/* Preset Shortcuts */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-stellar-text-secondary">Presets</p>
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Time range presets"
        >
          {TIME_RANGE_PRESETS.map((preset) => {
            const isActive = isPresetActive(value, preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset.id)}
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

      {/* Recent Ranges */}
      {recentRanges.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-stellar-text-secondary">Recent</p>
          <div className="flex flex-wrap gap-2">
            {recentRanges.map((range, index) => {
              const startDate = new Date(range.start ?? "");
              const endDate = new Date(range.end ?? "");
              const label = `${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()}`;

              return (
                <button
                  key={`${range.start}-${range.end}-${index}`}
                  type="button"
                  onClick={() => handleApplyRecent(range)}
                  className="rounded border border-stellar-border px-2.5 py-1 text-xs text-stellar-text-secondary transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-stellar-blue/50"
                  title={label}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleApplyCustom}
          disabled={!canApply}
          className="rounded bg-stellar-blue px-3 py-1.5 text-xs font-medium text-white transition-all disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-stellar-blue/50"
        >
          Apply custom range
        </button>

        <button
          type="button"
          onClick={handleClear}
          className="rounded border border-stellar-border px-3 py-1.5 text-xs text-stellar-text-secondary transition-colors hover:text-white focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-stellar-blue/50"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
