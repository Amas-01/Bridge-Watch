import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";

// ─── Context ────────────────────────────────────────────────────────────────

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (id: string) => void;
  baseId: string;
  orientation: "horizontal" | "vertical";
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab components must be used inside <Tabs>");
  return ctx;
}

// ─── Tabs (root) ─────────────────────────────────────────────────────────────

export interface TabsProps {
  /** The currently active tab id */
  activeTab: string;
  /** Called when the user selects a different tab */
  onTabChange: (id: string) => void;
  children: ReactNode;
  /** Keyboard navigation orientation — defaults to horizontal */
  orientation?: "horizontal" | "vertical";
  className?: string;
}

/**
 * Accessible tab container.
 *
 * Implements the ARIA Tabs pattern:
 * https://www.w3.org/WAI/ARIA/apg/patterns/tabs/
 *
 * - Arrow keys move focus between tabs (Left/Right for horizontal, Up/Down for vertical)
 * - Home / End jump to first / last tab
 * - Disabled tabs are skipped during keyboard navigation
 * - Each tab is linked to its panel via aria-controls / aria-labelledby
 */
export function Tabs({
  activeTab,
  onTabChange,
  children,
  orientation = "horizontal",
  className = "",
}: TabsProps) {
  const baseId = useId();

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab: onTabChange, baseId, orientation }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

// ─── TabList ─────────────────────────────────────────────────────────────────

export interface TabListProps {
  children: ReactNode;
  /** Accessible label for the tablist */
  "aria-label"?: string;
  /** ID of an element that labels this tablist */
  "aria-labelledby"?: string;
  className?: string;
}

/**
 * Container for Tab buttons. Handles keyboard navigation across all child tabs.
 */
export function TabList({
  children,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  className = "",
}: TabListProps) {
  const { orientation } = useTabsContext();
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const list = listRef.current;
      if (!list) return;

      // Collect all enabled tab buttons in DOM order
      const tabs = Array.from(
        list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])')
      );
      if (tabs.length === 0) return;

      const focused = document.activeElement as HTMLButtonElement | null;
      const currentIndex = focused ? tabs.indexOf(focused) : -1;

      const isHorizontal = orientation === "horizontal";
      const prevKey = isHorizontal ? "ArrowLeft" : "ArrowUp";
      const nextKey = isHorizontal ? "ArrowRight" : "ArrowDown";

      let targetIndex: number | null = null;

      if (e.key === prevKey) {
        targetIndex = currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1;
      } else if (e.key === nextKey) {
        targetIndex = currentIndex >= tabs.length - 1 ? 0 : currentIndex + 1;
      } else if (e.key === "Home") {
        targetIndex = 0;
      } else if (e.key === "End") {
        targetIndex = tabs.length - 1;
      }

      if (targetIndex !== null) {
        e.preventDefault();
        tabs[targetIndex].focus();
      }
    },
    [orientation]
  );

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-orientation={orientation}
      onKeyDown={handleKeyDown}
      className={className}
    >
      {children}
    </div>
  );
}

// ─── Tab ─────────────────────────────────────────────────────────────────────

export interface TabProps {
  /** Must match the id passed to the corresponding TabPanel */
  id: string;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
  /** Override active styling */
  activeClassName?: string;
  /** Override inactive styling */
  inactiveClassName?: string;
}

const DEFAULT_ACTIVE =
  "border-stellar-blue bg-stellar-blue/15 text-white";
const DEFAULT_INACTIVE =
  "border-stellar-border text-stellar-text-secondary hover:border-stellar-blue hover:text-white";
const DEFAULT_DISABLED =
  "border-stellar-border text-stellar-text-secondary opacity-40 cursor-not-allowed";

/**
 * A single tab button. Must be a direct child of TabList.
 */
export function Tab({
  id,
  children,
  disabled = false,
  className = "",
  activeClassName = DEFAULT_ACTIVE,
  inactiveClassName = DEFAULT_INACTIVE,
}: TabProps) {
  const { activeTab, setActiveTab, baseId } = useTabsContext();
  const isSelected = activeTab === id;

  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${id}`}
      aria-controls={`${baseId}-panel-${id}`}
      aria-selected={isSelected}
      disabled={disabled}
      tabIndex={isSelected ? 0 : -1}
      onClick={() => {
        if (!disabled) setActiveTab(id);
      }}
      className={[
        "rounded-full border px-4 py-2 text-sm transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue focus-visible:ring-offset-2 focus-visible:ring-offset-stellar-card",
        disabled ? DEFAULT_DISABLED : isSelected ? activeClassName : inactiveClassName,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </button>
  );
}

// ─── TabPanel ────────────────────────────────────────────────────────────────

export interface TabPanelProps {
  /** Must match the id passed to the corresponding Tab */
  id: string;
  children?: ReactNode;
  className?: string;
  /** When true the panel stays mounted but hidden; when false it is unmounted */
  keepMounted?: boolean;
}

/**
 * The content panel associated with a Tab. Hidden when not active.
 */
export function TabPanel({
  id,
  children,
  className = "",
  keepMounted = false,
}: TabPanelProps) {
  const { activeTab, baseId } = useTabsContext();
  const isActive = activeTab === id;

  if (!isActive && !keepMounted) return null;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${id}`}
      aria-labelledby={`${baseId}-tab-${id}`}
      hidden={!isActive}
      tabIndex={0}
      className={[
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue rounded",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
