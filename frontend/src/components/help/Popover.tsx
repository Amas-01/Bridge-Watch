import {
  useEffect,
  useRef,
  useState,
  useId,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";

export type PopoverPlacement = "top" | "bottom" | "left" | "right" | "auto";
type ResolvedPlacement = Exclude<PopoverPlacement, "auto">;

export interface PopoverProps {
  /** Short contextual copy shown in the popover body */
  content: ReactNode;
  /** Optional heading rendered above the body */
  title?: string;
  /** Optional link rendered at the bottom of the popover */
  link?: { href: string; label: string };
  /** Preferred placement relative to the trigger */
  placement?: PopoverPlacement;
  /** Trigger element – typically a HelpIcon button */
  children: ReactNode;
  /** Disable the popover entirely */
  disabled?: boolean;
  /** Extra classes applied to the popover panel */
  className?: string;
  /** Max width of the popover panel (Tailwind class, e.g. "max-w-xs") */
  maxWidth?: string;
}

const OFFSET = 10;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function resolveAuto(triggerRect: DOMRect): ResolvedPlacement {
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  const spaceRight = window.innerWidth - triggerRect.right;
  const spaceLeft = triggerRect.left;
  const max = Math.max(spaceBelow, spaceAbove, spaceRight, spaceLeft);
  if (max === spaceBelow) return "bottom";
  if (max === spaceAbove) return "top";
  if (max === spaceRight) return "right";
  return "left";
}

interface Coords {
  x: number;
  y: number;
  placement: ResolvedPlacement;
}

function computeCoords(
  triggerRect: DOMRect,
  panelRect: DOMRect,
  placement: PopoverPlacement
): Coords {
  const resolved: ResolvedPlacement =
    placement === "auto" ? resolveAuto(triggerRect) : placement;

  const pw = panelRect.width || 240;
  const ph = panelRect.height || 80;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let x = 0;
  let y = 0;

  if (resolved === "bottom") {
    x = triggerRect.left + triggerRect.width / 2 - pw / 2;
    y = triggerRect.bottom + OFFSET;
  } else if (resolved === "top") {
    x = triggerRect.left + triggerRect.width / 2 - pw / 2;
    y = triggerRect.top - ph - OFFSET;
  } else if (resolved === "right") {
    x = triggerRect.right + OFFSET;
    y = triggerRect.top + triggerRect.height / 2 - ph / 2;
  } else {
    x = triggerRect.left - pw - OFFSET;
    y = triggerRect.top + triggerRect.height / 2 - ph / 2;
  }

  return {
    x: clamp(x, 8, vw - pw - 8),
    y: clamp(y, 8, vh - ph - 8),
    placement: resolved,
  };
}

/**
 * Reusable inline-help popover.
 *
 * - Opens on hover, focus, and mobile tap
 * - Keyboard accessible: Escape closes, Enter/Space toggles
 * - Portal-rendered to avoid overflow clipping
 * - Theme-aware via Tailwind / CSS variables
 * - Supports optional title, body copy, and a "learn more" link
 * - No content overflow: viewport-clamped positioning
 */
export default function Popover({
  content,
  title,
  link,
  placement = "auto",
  children,
  disabled = false,
  className = "",
  maxWidth = "max-w-xs",
}: PopoverProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const popoverId = useId();

  const clearTimer = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
  };

  const recompute = useCallback(() => {
    if (!triggerRef.current || !panelRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const panelRect = panelRef.current.getBoundingClientRect();
    setCoords(computeCoords(triggerRect, panelRect, placement));
  }, [placement]);

  const show = () => {
    if (disabled) return;
    clearTimer();
    showTimer.current = setTimeout(() => setOpen(true), 120);
  };

  const hide = () => {
    clearTimer();
    setOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") hide();
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open ? hide() : show();
    }
  };

  // Recompute position after panel mounts / on scroll / resize
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(recompute);
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open, recompute]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !panelRef.current?.contains(e.target as Node)
      ) {
        hide();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  useEffect(() => () => clearTimer(), []);

  const resolvedPlacement = coords?.placement ?? "bottom";

  const placementArrow: Record<ResolvedPlacement, string> = {
    bottom:
      "bottom-full left-1/2 -translate-x-1/2 border-b-stellar-border border-b-[6px] border-x-transparent border-x-[6px] border-t-0",
    top: "top-full left-1/2 -translate-x-1/2 border-t-stellar-border border-t-[6px] border-x-transparent border-x-[6px] border-b-0",
    right:
      "right-full top-1/2 -translate-y-1/2 border-r-stellar-border border-r-[6px] border-y-transparent border-y-[6px] border-l-0",
    left: "left-full top-1/2 -translate-y-1/2 border-l-stellar-border border-l-[6px] border-y-transparent border-y-[6px] border-r-0",
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={(e) => {
          if (!panelRef.current?.contains(e.relatedTarget as Node)) hide();
        }}
        onKeyDown={handleKeyDown}
        onTouchStart={show}
        onTouchEnd={hide}
        aria-describedby={open ? popoverId : undefined}
        className="inline-flex items-center"
      >
        {children}
      </span>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            id={popoverId}
            role="tooltip"
            style={{
              position: "fixed",
              left: coords?.x ?? -9999,
              top: coords?.y ?? -9999,
              zIndex: 9999,
            }}
            className={`relative rounded-lg border border-stellar-border bg-stellar-card shadow-xl text-xs text-stellar-text-primary p-3 ${maxWidth} ${className}`}
          >
            {/* Directional arrow */}
            <span
              className={`absolute w-0 h-0 ${placementArrow[resolvedPlacement]}`}
              aria-hidden="true"
            />

            {title && (
              <p className="font-semibold text-stellar-text-primary mb-1">{title}</p>
            )}

            <div className="text-stellar-text-secondary leading-relaxed">{content}</div>

            {link && (
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-stellar-blue hover:underline focus:outline-none focus:ring-1 focus:ring-stellar-blue rounded"
                onFocus={() => setOpen(true)}
              >
                {link.label}
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
              </a>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
