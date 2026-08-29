import { type ReactNode } from "react";
import Tooltip, { type TooltipProps } from "./Tooltip.js";
import CopyButton from "../CopyButton.js";

export interface DataTooltipProps extends Omit<TooltipProps, "content"> {
  label: string;
  value?: string | number;
  description?: ReactNode;
  link?: { href: string; label: string };
  showCopy?: boolean;
  copyValue?: string;
  badge?: ReactNode;
}

function DataTooltipContent({
  label,
  value,
  description,
  link,
  showCopy,
  copyValue,
  badge,
}: Omit<DataTooltipProps, keyof TooltipProps | "label"> & { label: string }) {
  const textToCopy = copyValue ?? (value !== undefined ? String(value) : label);

  return (
    <div className="space-y-1 min-w-[120px] max-w-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-stellar-text-primary">{label}</span>
        {badge && <span>{badge}</span>}
      </div>

      {value !== undefined && (
        <div className="text-sm font-medium text-stellar-text-primary tabular-nums">
          {value}
        </div>
      )}

      {description && (
        <div className="text-xs text-stellar-text-secondary leading-relaxed">{description}</div>
      )}

      {link && (
        <a
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2 block mt-1"
          style={{ pointerEvents: "auto" }}
        >
          {link.label} ↗
        </a>
      )}

      {showCopy && (
        <div className="flex justify-end pt-0.5" style={{ pointerEvents: "auto" }}>
          <CopyButton value={textToCopy} label="Copy" ariaLabel={`Copy ${label}`} />
        </div>
      )}
    </div>
  );
}

export default function DataTooltip({
  label,
  value,
  description,
  link,
  showCopy = false,
  copyValue,
  badge,
  children,
  ...tooltipProps
}: DataTooltipProps) {
  const content = (
    <DataTooltipContent
      label={label}
      value={value}
      description={description}
      link={link}
      showCopy={showCopy}
      copyValue={copyValue}
      badge={badge}
    />
  );

  return (
    <Tooltip content={content} {...tooltipProps}>
      {children}
    </Tooltip>
  );
}
