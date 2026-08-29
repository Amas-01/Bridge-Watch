import { useState, useCallback, useRef } from "react";

export interface TooltipPosition {
  x: number;
  y: number;
}

export interface UseTooltipResult {
  visible: boolean;
  position: TooltipPosition;
  show: (e: React.MouseEvent | React.TouchEvent | React.FocusEvent) => void;
  hide: () => void;
  move: (e: React.MouseEvent | React.TouchEvent) => void;
}

const OFFSET_X = 12;
const OFFSET_Y = 12;

function clientCoords(e: React.MouseEvent | React.TouchEvent | React.FocusEvent): { clientX: number; clientY: number } | null {
  if ("touches" in e && e.touches.length > 0) {
    return { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY };
  }
  if ("clientX" in e) {
    return { clientX: e.clientX, clientY: e.clientY };
  }
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  return { clientX: rect.left + rect.width / 2, clientY: rect.top };
}

export function useTooltip(): UseTooltipResult {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<TooltipPosition>({ x: 0, y: 0 });
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const show = useCallback((e: React.MouseEvent | React.TouchEvent | React.FocusEvent) => {
    clearHideTimer();
    const coords = clientCoords(e);
    if (coords) {
      setPosition({ x: coords.clientX + OFFSET_X, y: coords.clientY + OFFSET_Y });
    }
    setVisible(true);
  }, []);

  const hide = useCallback(() => {
    hideTimer.current = setTimeout(() => setVisible(false), 100);
  }, []);

  const move = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const coords = clientCoords(e);
    if (coords) {
      setPosition({ x: coords.clientX + OFFSET_X, y: coords.clientY + OFFSET_Y });
    }
  }, []);

  return { visible, position, show, hide, move };
}
