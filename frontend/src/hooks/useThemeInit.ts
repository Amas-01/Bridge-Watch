import { useEffect, useRef } from "react";
import { useThemeStore, useTheme } from "../stores";
import { useUserPreferencesStore } from "../stores/userPreferencesStore";

/**
 * Hook to initialize and manage theme on application mount.
 * Applies the theme to the document and handles system theme changes.
 */
export function useThemeInit() {
  const { resolvedMode, applyTheme, setResolvedMode, mode, setMode } = useThemeStore();
  const theme = useTheme();
  
  const displayMode = useUserPreferencesStore((s: any) => s.displayMode);
  const setPreference = useUserPreferencesStore((s) => s.setPreference);
  const initialized = useRef(false);

  // Apply theme on mount
  useEffect(() => {
    applyTheme();
  }, []);

  // Sync with backend preferences on load and on preference change
  useEffect(() => {
    if (displayMode && displayMode !== mode) {
      setMode(displayMode as "light" | "dark" | "system");
    }
  }, [displayMode]);

  // Sync mode back to preferences if it changes after init
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    if (mode && mode !== displayMode) {
      setPreference("displayMode", mode);
    }
  }, [mode]);

  // Re-apply when resolved mode changes
  useEffect(() => {
    applyTheme();
  }, [resolvedMode, applyTheme]);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (mode !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setResolvedMode(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [mode, setResolvedMode]);

  return theme;
}

/**
 * Hook to get CSS class names based on theme settings
 */
export function useThemeClasses() {
  const { resolvedMode, font, density, animationsEnabled, reducedMotion } =
    useThemeStore();

  return {
    themeClass: `theme-${resolvedMode}`,
    fontSizeClass: `text-${font.size}`,
    lineHeightClass: `leading-${font.lineHeight}`,
    densityClass: `density-${density}`,
    animationClass:
      !animationsEnabled || reducedMotion ? "reduce-motion" : "",
  };
}
