import { type ReactNode } from "react";
import CopyButton from "../CopyButton.js";

export interface ChartDataPoint {
  label: string;
  value: string | number;
  color?: string;
  unit?: string;
}

export interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number | string; color?: string; unit?: string }>;
  label?: string;
  title?: ReactNode;
  formatter?: (value: number | string, name: string) => string;
  labelFormatter?: (label: string) => string;
  showCopy?: boolean;
  extra?: ReactNode;
}

function formatDefault(value: number | string): string {
  if (typeof value === "number") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  return String(value);
}

export default function ChartTooltip({
  active,
  payload,
  label,
  title,
  formatter,
  labelFormatter,
  showCopy = false,
  extra,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const displayLabel = label
    ? labelFormatter
      ? labelFormatter(label)
      : label
    : null;

  const copyText = payload
    .map((p) => {
      const val = formatter ? formatter(p.value, p.name) : formatDefault(p.value);
      return `${p.name}: ${val}${p.unit ?? ""}`;
    })
    .join("\n");

  return (
    <div
      role="tooltip"
      className="bg-stellar-card border border-stellar-border rounded-lg shadow-xl px-3 py-2 min-w-[140px] max-w-xs"
      style={{ pointerEvents: "none" }}
    >
      {title && (
        <div className="text-xs font-semibold text-stellar-text-primary mb-1.5 border-b border-stellar-border pb-1">
          {title}
        </div>
      )}
      {displayLabel && (
        <div className="text-xs text-stellar-text-secondary mb-1.5 tabular-nums">
          {displayLabel}
        </div>
      )}

      <div className="space-y-1">
        {payload.map((entry, idx) => {
          const displayValue = formatter
            ? formatter(entry.value, entry.name)
            : formatDefault(entry.value);
          return (
            <div key={idx} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs text-stellar-text-secondary">
                {entry.color && (
                  <span
                    className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: entry.color }}
                  />
                )}
                {entry.name}
              </span>
              <span className="text-xs font-medium text-stellar-text-primary tabular-nums">
                {displayValue}
                {entry.unit && (
                  <span className="text-stellar-text-secondary ml-0.5">{entry.unit}</span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {extra && (
        <div className="mt-1.5 pt-1.5 border-t border-stellar-border text-xs text-stellar-text-secondary">
          {extra}
        </div>
      )}

      {showCopy && (
        <div className="mt-1.5 flex justify-end" style={{ pointerEvents: "auto" }}>
          <CopyButton value={copyText} label="Copy" ariaLabel="Copy tooltip values" />
        </div>
      )}
    </div>
  );
}
