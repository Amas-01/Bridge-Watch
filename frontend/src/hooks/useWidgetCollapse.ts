// import { useLayoutEffect } from "react";
import { useLocalStorageState } from "./useLocalStorageState";

export function useWidgetCollapse(
  widgetId: string,
  defaultCollapsed: boolean = false,
) {
  const [isCollapsed, setIsCollapsed] = useLocalStorageState<boolean>(
    `bridge-watch:widget-collapsed:${widgetId}`,
    defaultCollapsed,
  );

  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  return { isCollapsed, setIsCollapsed, toggleCollapse };
}
