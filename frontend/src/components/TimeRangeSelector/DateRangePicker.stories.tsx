import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import DateRangePicker from "./DateRangePicker";
import type { TimeRangeSelection } from "../../utils/timeRange";

const meta = {
  title: "Bridge Watch/Components/DateRangePicker",
  component: DateRangePicker,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof DateRangePicker>;

export default meta;
type Story = StoryObj<typeof DateRangePicker>;

/**
 * Default state with no initial value.
 * Shows empty date inputs, preset shortcuts, and action buttons.
 */
export const Default: Story = {
  render: () => {
    const [applied, setApplied] = useState<TimeRangeSelection | undefined>();

    return (
      <div className="space-y-4">
        <DateRangePicker
          onApply={(selection) => {
            setApplied(selection);
            console.log("Applied:", selection);
          }}
          onClear={() => {
            setApplied(undefined);
            console.log("Cleared");
          }}
        />
        {applied && (
          <div className="rounded-md border border-stellar-border p-3">
            <p className="text-xs font-medium text-stellar-text-secondary">Applied Range:</p>
            <pre className="mt-2 text-xs text-stellar-text-primary">
              {JSON.stringify(applied, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  },
};

/**
 * With a preset active (24H).
 * Shows the preset button highlighted and the corresponding date range in inputs.
 */
export const WithPresetActive: Story = {
  render: () => {
    const now = new Date();
    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const value: TimeRangeSelection = {
      preset: "24H",
      start: start.toISOString(),
      end: now.toISOString(),
    };

    return (
      <div className="space-y-4">
        <DateRangePicker
          value={value}
          onApply={(selection) => console.log("Applied:", selection)}
          onClear={() => console.log("Cleared")}
        />
        <p className="text-xs text-stellar-text-secondary">
          The 24H preset button is highlighted as active.
        </p>
      </div>
    );
  },
};

/**
 * With a custom range applied.
 * Shows custom start and end dates in the inputs.
 */
export const WithCustomRange: Story = {
  render: () => {
    const value: TimeRangeSelection = {
      start: "2026-04-01T00:00:00.000Z",
      end: "2026-04-20T23:59:59.999Z",
    };

    return (
      <div className="space-y-4">
        <DateRangePicker
          value={value}
          onApply={(selection) => console.log("Applied:", selection)}
          onClear={() => console.log("Cleared")}
        />
        <p className="text-xs text-stellar-text-secondary">
          Custom date range is displayed in the inputs.
        </p>
      </div>
    );
  },
};

/**
 * With validation error.
 * Shows error message when end date is before start date.
 */
export const WithValidationError: Story = {
  render: () => {
    const [start, setStart] = useState("2026-04-20T12:00");
    const [end, setEnd] = useState("2026-04-01T12:00");

    return (
      <div className="space-y-4">
        <div className="rounded-md border border-stellar-border p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-stellar-text-secondary">
              Start
              <input
                type="datetime-local"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-stellar-text-secondary">
              End
              <input
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white"
              />
            </label>
          </div>
          <p className="mt-3 text-xs text-red-400">
            Start date must be before end date.
          </p>
          <button
            disabled
            className="mt-3 rounded bg-stellar-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Apply custom range
          </button>
        </div>
        <p className="text-xs text-stellar-text-secondary">
          The Apply button is disabled and error message is displayed.
        </p>
      </div>
    );
  },
};

/**
 * Mobile layout view.
 * Shows the picker at a mobile viewport width (below 640px).
 */
export const MobileLayout: Story = {
  render: () => {
    const [applied, setApplied] = useState<TimeRangeSelection | undefined>();

    return (
      <div className="space-y-4">
        <div className="w-full max-w-sm">
          <DateRangePicker
            onApply={(selection) => {
              setApplied(selection);
              console.log("Applied:", selection);
            }}
            onClear={() => {
              setApplied(undefined);
              console.log("Cleared");
            }}
          />
        </div>
        <p className="text-xs text-stellar-text-secondary">
          Resize your browser to below 640px to see mobile layout. Date inputs stack vertically.
        </p>
        {applied && (
          <div className="rounded-md border border-stellar-border p-3">
            <p className="text-xs font-medium text-stellar-text-secondary">Applied Range:</p>
            <pre className="mt-2 text-xs text-stellar-text-primary">
              {JSON.stringify(applied, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  },
};

/**
 * With recent ranges.
 * Shows recently applied custom ranges below the preset shortcuts.
 */
export const WithRecentRanges: Story = {
  render: () => {
    // Pre-populate localStorage with recent ranges
    const recentRanges: TimeRangeSelection[] = [
      {
        start: "2026-04-15T00:00:00.000Z",
        end: "2026-04-20T23:59:59.999Z",
      },
      {
        start: "2026-04-08T00:00:00.000Z",
        end: "2026-04-15T23:59:59.999Z",
      },
      {
        start: "2026-04-01T00:00:00.000Z",
        end: "2026-04-08T23:59:59.999Z",
      },
    ];

    if (typeof window !== "undefined") {
      localStorage.setItem("bridgewatch.recentRanges.v1", JSON.stringify(recentRanges));
    }

    const [applied, setApplied] = useState<TimeRangeSelection | undefined>();

    return (
      <div className="space-y-4">
        <DateRangePicker
          onApply={(selection) => {
            setApplied(selection);
            console.log("Applied:", selection);
          }}
          onClear={() => {
            setApplied(undefined);
            console.log("Cleared");
          }}
        />
        <p className="text-xs text-stellar-text-secondary">
          Recent ranges are displayed below the preset shortcuts.
        </p>
        {applied && (
          <div className="rounded-md border border-stellar-border p-3">
            <p className="text-xs font-medium text-stellar-text-secondary">Applied Range:</p>
            <pre className="mt-2 text-xs text-stellar-text-primary">
              {JSON.stringify(applied, null, 2)}
            </pre>
          </div>
        )}
      </div>
    );
  },
};

/**
 * Interactive example with all features.
 * Demonstrates preset selection, custom range input, validation, and recent ranges.
 */
export const Interactive: Story = {
  render: () => {
    const [applied, setApplied] = useState<TimeRangeSelection | undefined>();
    const [showRecent, setShowRecent] = useState(true);

    // Pre-populate with some recent ranges
    if (typeof window !== "undefined" && showRecent) {
      const existing = localStorage.getItem("bridgewatch.recentRanges.v1");
      if (!existing) {
        const recentRanges: TimeRangeSelection[] = [
          {
            start: "2026-04-15T00:00:00.000Z",
            end: "2026-04-20T23:59:59.999Z",
          },
        ];
        localStorage.setItem("bridgewatch.recentRanges.v1", JSON.stringify(recentRanges));
      }
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-stellar-text-secondary">
            <input
              type="checkbox"
              checked={showRecent}
              onChange={(e) => {
                setShowRecent(e.target.checked);
                if (!e.target.checked) {
                  localStorage.removeItem("bridgewatch.recentRanges.v1");
                }
              }}
              className="mr-2"
            />
            Show recent ranges
          </label>
        </div>

        <DateRangePicker
          value={applied}
          onApply={(selection) => {
            setApplied(selection);
            console.log("Applied:", selection);
          }}
          onClear={() => {
            setApplied(undefined);
            console.log("Cleared");
          }}
        />

        {applied && (
          <div className="rounded-md border border-stellar-border p-3">
            <p className="text-xs font-medium text-stellar-text-secondary">Applied Range:</p>
            <pre className="mt-2 text-xs text-stellar-text-primary">
              {JSON.stringify(applied, null, 2)}
            </pre>
          </div>
        )}

        <div className="rounded-md border border-stellar-border p-3">
          <p className="text-xs font-medium text-stellar-text-secondary">Features:</p>
          <ul className="mt-2 space-y-1 text-xs text-stellar-text-secondary">
            <li>• Click preset buttons to apply quick ranges</li>
            <li>• Enter custom start and end dates</li>
            <li>• Click "Apply custom range" to save and persist</li>
            <li>• Recent ranges appear below presets</li>
            <li>• Use Tab/Shift+Tab for keyboard navigation</li>
            <li>• Press Escape to close without changes</li>
          </ul>
        </div>
      </div>
    );
  },
};
