import { useCallback, useEffect, useRef, useState } from "react";

type PullToRefreshOptions = {
  enabled: boolean;
  onRefresh: () => void | Promise<void>;
  thresholdPx?: number;
};

type PullState = {
  isPulling: boolean;
  pullDistance: number;
  progress: number;
  isRefreshing: boolean;
  shouldTrigger: boolean;
};

const DEFAULT_THRESHOLD_PX = 84;

export function usePullToRefresh({
  enabled,
  onRefresh,
  thresholdPx = DEFAULT_THRESHOLD_PX,
}: PullToRefreshOptions) {
  const [state, setState] = useState<PullState>({
    isPulling: false,
    pullDistance: 0,
    progress: 0,
    isRefreshing: false,
    shouldTrigger: false,
  });
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const activeRef = useRef(false);
  const refreshingRef = useRef(false);
  const shouldTriggerRef = useRef(false);

  const reset = useCallback(() => {
    startPointRef.current = null;
    activeRef.current = false;
    shouldTriggerRef.current = false;
    setState({
      isPulling: false,
      pullDistance: 0,
      progress: 0,
      isRefreshing: refreshingRef.current,
      shouldTrigger: false,
    });
  }, []);

  const runRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setState((current) => ({ ...current, isRefreshing: true, shouldTrigger: false }));
    shouldTriggerRef.current = false;

    try {
      await onRefresh();
    } finally {
      refreshingRef.current = false;
      reset();
    }
  }, [onRefresh, reset]);

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    const canStart = () => window.scrollY <= 0 && !refreshingRef.current;

    const handleTouchStart = (event: TouchEvent) => {
      if (!canStart()) return;

      const touch = event.touches[0];
      if (!touch) return;

      startPointRef.current = { x: touch.clientX, y: touch.clientY };
      activeRef.current = true;
      setState((current) => ({
        ...current,
        isPulling: false,
        pullDistance: 0,
        progress: 0,
        shouldTrigger: false,
      }));
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!activeRef.current || !startPointRef.current) return;

      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = Math.abs(touch.clientX - startPointRef.current.x);
      const deltaY = touch.clientY - startPointRef.current.y;

      if (deltaY <= 0 || deltaX > deltaY) {
        return;
      }

      if (window.scrollY > 0) {
        reset();
        return;
      }

      event.preventDefault();

      const pullDistance = Math.min(deltaY, thresholdPx * 1.5);
      const progress = Math.min(pullDistance / thresholdPx, 1);

      setState({
        isPulling: true,
        pullDistance,
        progress,
        isRefreshing: refreshingRef.current,
        shouldTrigger: pullDistance >= thresholdPx,
      });
      shouldTriggerRef.current = pullDistance >= thresholdPx;
    };

    const handleTouchEnd = () => {
      if (shouldTriggerRef.current) {
        void runRefresh();
        return;
      }

      reset();
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    window.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [enabled, reset, runRefresh, thresholdPx]);

  return {
    ...state,
    isSupported: enabled,
    refresh: runRefresh,
  };
}
