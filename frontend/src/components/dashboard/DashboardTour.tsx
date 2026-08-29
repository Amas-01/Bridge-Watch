import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { TourStep } from "../../hooks/useDashboardTour";

interface DashboardTourProps {
  readonly steps: TourStep[];
  readonly activeStep: number | null;
  readonly onNext: () => void;
  readonly onPrev: () => void;
  readonly onSkip: () => void;
  readonly onFinish: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_WIDTH = 320;

function readRect(target: string): TargetRect | null {
  if (typeof document === "undefined") return null;
  const element = document.querySelector(target);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/**
 * Lightweight dashboard tour overlay. Renders a spotlight around the active
 * step's target element and an accessible tooltip with step navigation.
 * Positioning recomputes on resize/scroll so it stays responsive.
 */
export default function DashboardTour({
  steps,
  activeStep,
  onNext,
  onPrev,
  onSkip,
  onFinish,
}: DashboardTourProps) {
  const [rect, setRect] = useState<TargetRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const step = activeStep !== null ? steps[activeStep] : null;
  const isLast = activeStep !== null && activeStep === steps.length - 1;
  const isFirst = activeStep === 0;

  const updateRect = useCallback(() => {
    if (!step) {
      setRect(null);
      return;
    }
    setRect(readRect(step.target));
  }, [step]);

  // Scroll the target into view and measure it when the step changes.
  useLayoutEffect(() => {
    if (!step) return;
    const element = document.querySelector(step.target);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    updateRect();
  }, [step, updateRect]);

  // Keep the spotlight aligned as the layout changes (responsive positioning).
  useEffect(() => {
    if (!step) return;
    const handle = () => updateRect();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    const interval = window.setInterval(handle, 250);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
      window.clearInterval(interval);
    };
  }, [step, updateRect]);

  // Move focus to the tooltip on each step for keyboard/screen-reader users.
  useEffect(() => {
    if (step && tooltipRef.current) {
      tooltipRef.current.focus();
    }
  }, [step]);

  // Keyboard navigation.
  useEffect(() => {
    if (!step) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onSkip();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        onNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onPrev();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [step, onNext, onPrev, onSkip]);

  if (!step || activeStep === null || typeof document === "undefined") {
    return null;
  }

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // Resolve tooltip position. Prefer below the target, flip above if needed.
  let tooltipTop = TOOLTIP_GAP;
  let tooltipLeft = TOOLTIP_GAP;

  if (rect) {
    const spaceBelow = viewportHeight - (rect.top + rect.height);
    const placeBelow = step.placement === "bottom" || (step.placement !== "top" && spaceBelow > 220);

    tooltipTop = placeBelow
      ? rect.top + rect.height + SPOTLIGHT_PADDING + TOOLTIP_GAP
      : Math.max(TOOLTIP_GAP, rect.top - SPOTLIGHT_PADDING - TOOLTIP_GAP - 200);

    tooltipLeft = Math.min(
      Math.max(rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2, TOOLTIP_GAP),
      viewportWidth - TOOLTIP_WIDTH - TOOLTIP_GAP,
    );
  } else {
    // No target found — center the tooltip.
    tooltipTop = viewportHeight / 2 - 120;
    tooltipLeft = Math.max(TOOLTIP_GAP, viewportWidth / 2 - TOOLTIP_WIDTH / 2);
  }

  const titleId = `dashboard-tour-title-${step.id}`;
  const bodyId = `dashboard-tour-body-${step.id}`;

  return createPortal(
    <div className="fixed inset-0 z-[100]" aria-hidden={false}>
      {/* Dimmed backdrop. Clicking outside skips the tour. */}
      <button
        type="button"
        aria-label="Skip tour"
        onClick={onSkip}
        className="absolute inset-0 h-full w-full cursor-default bg-black/50"
      />

      {/* Spotlight around the target element. */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-lg ring-2 ring-stellar-blue transition-all duration-200"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
          }}
        />
      ) : null}

      {/* Tooltip / step card. */}
      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        tabIndex={-1}
        className="absolute w-80 rounded-xl border border-stellar-border bg-stellar-card p-4 shadow-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-stellar-text-secondary">
            Step {activeStep + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-stellar-text-secondary hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
          >
            Skip
          </button>
        </div>

        <h3 id={titleId} className="mt-2 text-base font-semibold text-white">
          {step.title}
        </h3>
        <p id={bodyId} className="mt-1 text-sm text-stellar-text-secondary" aria-live="polite">
          {step.body}
        </p>

        {/* Progress dots. */}
        <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
          {steps.map((dot, index) => (
            <span
              key={dot.id}
              className={`h-1.5 rounded-full transition-all ${
                index === activeStep ? "w-4 bg-stellar-blue" : "w-1.5 bg-stellar-border"
              }`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={isFirst}
            className="rounded-md border border-stellar-border px-3 py-1.5 text-sm text-stellar-text-secondary transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
          >
            Back
          </button>
          <button
            type="button"
            onClick={isLast ? onFinish : onNext}
            className="rounded-md border border-stellar-blue bg-stellar-blue/20 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-stellar-blue/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
          >
            {isLast ? "Finish" : "Next"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
