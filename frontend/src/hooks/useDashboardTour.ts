import { useCallback, useEffect, useState } from "react";
import { useLocalStorageState } from "./useLocalStorageState";

export type TourPlacement = "top" | "bottom" | "left" | "right" | "auto";

export interface TourStep {
  /** Stable id for the step. */
  id: string;
  /** CSS selector for the element the step highlights, e.g. `[data-tour="kpis"]`. */
  target: string;
  /** Step heading. */
  title: string;
  /** Step body copy. */
  body: string;
  /** Preferred tooltip placement relative to the target. */
  placement?: TourPlacement;
}

interface TourProgress {
  /** True once the user has reached the end of the tour. */
  completed: boolean;
  /** Last step index the user was on (used to resume after skipping). */
  lastStep: number;
  /** True once the tour has been started at least once (suppresses auto-start). */
  seen: boolean;
}

const DEFAULT_PROGRESS: TourProgress = { completed: false, lastStep: 0, seen: false };

interface UseDashboardTourOptions {
  /** Number of steps in the tour. */
  stepCount: number;
  /** Local storage key for persisting completion/resume state. */
  storageKey?: string;
  /** Auto-start the tour on first visit when it has never been seen. */
  autoStart?: boolean;
}

/**
 * Drives a step-by-step dashboard tour overlay. Persists completion and the
 * last-viewed step so the tour can be skipped and resumed, and auto-starts once
 * for users who have never seen it.
 */
export function useDashboardTour({
  stepCount,
  storageKey = "bridge-watch:dashboard-tour:v1",
  autoStart = true,
}: UseDashboardTourOptions) {
  const [progress, setProgress] = useLocalStorageState<TourProgress>(storageKey, DEFAULT_PROGRESS);
  const [activeStep, setActiveStep] = useState<number | null>(null);

  const clamp = useCallback(
    (index: number) => Math.min(Math.max(index, 0), Math.max(stepCount - 1, 0)),
    [stepCount],
  );

  // Auto-start once for users who have never engaged with the tour.
  useEffect(() => {
    if (!autoStart || stepCount === 0) return;
    if (!progress.seen && activeStep === null) {
      setActiveStep(0);
      setProgress((prev) => ({ ...prev, seen: true }));
    }
  }, [autoStart, stepCount, progress.seen, activeStep, setProgress]);

  const start = useCallback(() => {
    // Resume where the user left off unless the tour was completed.
    const resumeAt = progress.completed ? 0 : clamp(progress.lastStep);
    setActiveStep(resumeAt);
    setProgress((prev) => ({ ...prev, seen: true }));
  }, [progress.completed, progress.lastStep, clamp, setProgress]);

  const goTo = useCallback(
    (index: number) => {
      const next = clamp(index);
      setActiveStep(next);
      setProgress((prev) => ({ ...prev, lastStep: next }));
    },
    [clamp, setProgress],
  );

  const next = useCallback(() => {
    setActiveStep((current) => {
      if (current === null) return current;
      if (current >= stepCount - 1) {
        setProgress((prev) => ({ ...prev, completed: true, lastStep: 0 }));
        return null;
      }
      const nextIndex = clamp(current + 1);
      setProgress((prev) => ({ ...prev, lastStep: nextIndex }));
      return nextIndex;
    });
  }, [stepCount, clamp, setProgress]);

  const prev = useCallback(() => {
    setActiveStep((current) => {
      if (current === null) return current;
      const prevIndex = clamp(current - 1);
      setProgress((p) => ({ ...p, lastStep: prevIndex }));
      return prevIndex;
    });
  }, [clamp, setProgress]);

  const skip = useCallback(() => {
    // Keep lastStep so the tour can be resumed; do not mark completed.
    setActiveStep((current) => {
      if (current !== null) {
        setProgress((prev) => ({ ...prev, lastStep: clamp(current) }));
      }
      return null;
    });
  }, [clamp, setProgress]);

  const finish = useCallback(() => {
    setActiveStep(null);
    setProgress((prev) => ({ ...prev, completed: true, lastStep: 0 }));
  }, [setProgress]);

  const reset = useCallback(() => {
    setProgress(DEFAULT_PROGRESS);
    setActiveStep(0);
  }, [setProgress]);

  return {
    activeStep,
    isActive: activeStep !== null,
    completed: progress.completed,
    start,
    next,
    prev,
    skip,
    finish,
    goTo,
    reset,
  };
}
