import type { ReactNode } from "react";
import Popover, { type PopoverProps } from "./Popover";

export interface HelpIconProps
  extends Omit<PopoverProps, "children"> {
  /** Accessible label for the trigger button */
  "aria-label"?: string;
  /** Size variant */
  size?: "sm" | "md";
  /** Custom trigger element – defaults to the standard "?" circle */
  trigger?: ReactNode;
}

/**
 * A small "?" icon button that opens an inline help popover on hover/focus/tap.
 *
 * Usage:
 * ```tsx
 * <HelpIcon
 *   title="Price Deviation"
 *   content="Percentage difference between the on-chain price and the reference oracle."
 *   link={{ href: "/docs/metrics", label: "Learn more" }}
 * />
 * ```
 */
export default function HelpIcon({
  "aria-label": ariaLabel = "Show help",
  size = "sm",
  trigger,
  ...popoverProps
}: HelpIconProps) {
  const sizeClasses =
    size === "md"
      ? "h-5 w-5 text-sm"
      : "h-4 w-4 text-[10px]";

  const defaultTrigger = (
    <button
      type="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className={`inline-flex items-center justify-center rounded-full border border-stellar-border
        text-stellar-text-secondary bg-transparent
        hover:border-stellar-blue hover:text-stellar-blue
        focus:outline-none focus:ring-2 focus:ring-stellar-blue focus:ring-offset-1 focus:ring-offset-stellar-card
        transition-colors cursor-help ${sizeClasses}`}
    >
      ?
    </button>
  );

  return (
    <Popover {...popoverProps}>
      {trigger ?? defaultTrigger}
    </Popover>
  );
}
