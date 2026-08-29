import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type TooltipTheme = "dark" | "light";
export type TooltipPlacement = "top" | "bottom" | "left" | "right" | "auto";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  theme?: TooltipTheme;
  placement?: TooltipPlacement;
  delay?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

const OFFSET = 8;

const themeClasses: Record<TooltipTheme, string> = {
  dark: "bg-stellar-card border border-stellar-border text-stellar-text-primary shadow-lg",
  light: "bg-white border border-gray-200 text-gray-800 shadow-md",
};

function clampToViewport(x: number, y: number, width: number, height: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return {
    x: Math.min(Math.max(x, 8), vw - width - 8),
    y: Math.min(Math.max(y, 8), vh - height - 8),
  };
}

export default function Tooltip({
  content,
  children,
  theme = "dark",
  placement = "auto",
  delay = 300,
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useRef(`tooltip-${Math.random().toString(36).slice(2)}`).current;

  const clearShowTimer = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
  };

  const computePosition = () => {
    if (!triggerRef.current || !tooltipRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tipRect = tooltipRef.current.getBoundingClientRect();
    const w = tipRect.width || 160;
    const h = tipRect.height || 40;

    let x = 0;
    let y = 0;
    const resolvedPlacement =
      placement === "auto"
        ? triggerRect.top > h + OFFSET
          ? "top"
          : "bottom"
        : placement;

    if (resolvedPlacement === "top") {
      x = triggerRect.left + triggerRect.width / 2 - w / 2;
      y = triggerRect.top - h - OFFSET;
    } else if (resolvedPlacement === "bottom") {
      x = triggerRect.left + triggerRect.width / 2 - w / 2;
      y = triggerRect.bottom + OFFSET;
    } else if (resolvedPlacement === "left") {
      x = triggerRect.left - w - OFFSET;
      y = triggerRect.top + triggerRect.height / 2 - h / 2;
    } else {
      x = triggerRect.right + OFFSET;
      y = triggerRect.top + triggerRect.height / 2 - h / 2;
    }

    const clamped = clampToViewport(x, y, w, h);
    setCoords(clamped);
  };

  const handleShow = () => {
    if (disabled) return;
    clearShowTimer();
    showTimer.current = setTimeout(() => {
      setVisible(true);
    }, delay);
  };

  const handleHide = () => {
    clearShowTimer();
    setVisible(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") handleHide();
  };

  useEffect(() => {
    if (visible) computePosition();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const onScroll = () => computePosition();
    const onResize = () => computePosition();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [visible]);

  useEffect(() => () => clearShowTimer(), []);

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleShow}
        onMouseLeave={handleHide}
        onFocus={handleShow}
        onBlur={handleHide}
        onKeyDown={handleKeyDown}
        onTouchStart={handleShow}
        onTouchEnd={handleHide}
        aria-describedby={visible ? tooltipId : undefined}
        className="inline-block"
      >
        {children}
      </span>

      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            aria-label={ariaLabel}
            style={{
              position: "fixed",
              left: coords.x,
              top: coords.y,
              zIndex: 9999,
              pointerEvents: "none",
            }}
            className={`rounded-lg px-3 py-2 text-xs max-w-xs ${themeClasses[theme]} ${className}`}
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
