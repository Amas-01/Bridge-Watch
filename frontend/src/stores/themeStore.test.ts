/**
 * Tests for themeStore — theme state and persistence logic
 * Following exact pattern from notificationStore test
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "./themeStore";

const PERSIST_KEY = "bridge-watch-theme";

function resetStoreState() {
  const initialState = useThemeStore.getInitialState();
  useThemeStore.setState(initialState, true);
}

describe("themeStore", () => {
  beforeEach(() => {
    localStorage.clear();
    resetStoreState();
  });

  it("initial state is the default theme", () => {
    const state = useThemeStore.getState();

    expect(state.mode).toBe("system");
    expect(state.resolvedMode).toBe("dark");
    expect(state.activePresetId).toBe("stellar");
    expect(state.density).toBe("comfortable");
    expect(state.animationsEnabled).toBe(true);
    expect(state.reducedMotion).toBe(false);
  });

  it("setMode('dark') updates mode to dark", () => {
    useThemeStore.getState().setMode("dark");

    const state = useThemeStore.getState();
    expect(state.mode).toBe("dark");
    expect(state.resolvedMode).toBe("dark");
  });

  it("setMode('light') updates mode to light", () => {
    useThemeStore.getState().setMode("light");

    const state = useThemeStore.getState();
    expect(state.mode).toBe("light");
    expect(state.resolvedMode).toBe("light");
  });

  it("setMode with the same value is idempotent", () => {
    const store = useThemeStore.getState();

    store.setMode("dark");
    const firstState = useThemeStore.getState();

    store.setMode("dark");
    const secondState = useThemeStore.getState();

    expect(firstState.mode).toBe("dark");
    expect(secondState.mode).toBe("dark");
    expect(firstState.resolvedMode).toBe(secondState.resolvedMode);
  });

  it("toggleMode switches from light to dark", () => {
    const store = useThemeStore.getState();

    store.setMode("light");
    expect(useThemeStore.getState().resolvedMode).toBe("light");

    store.toggleMode();

    const state = useThemeStore.getState();
    expect(state.resolvedMode).toBe("dark");
    expect(state.mode).toBe("dark");
  });

  it("toggleMode switches from dark to light", () => {
    const store = useThemeStore.getState();

    store.setMode("dark");
    expect(useThemeStore.getState().resolvedMode).toBe("dark");

    store.toggleMode();

    const state = useThemeStore.getState();
    expect(state.resolvedMode).toBe("light");
    expect(state.mode).toBe("light");
  });

  it("toggleMode from default state toggles from dark to light", () => {
    // Default resolvedMode is "dark"
    const initialMode = useThemeStore.getState().resolvedMode;
    expect(initialMode).toBe("dark");

    useThemeStore.getState().toggleMode();

    const state = useThemeStore.getState();
    expect(state.resolvedMode).toBe("light");
  });

  it("setDensity updates density", () => {
    useThemeStore.getState().setDensity("compact");

    const state = useThemeStore.getState();
    expect(state.density).toBe("compact");
    expect(state.activePresetId).toBe("custom");
  });

  it("setMode persists to storage", () => {
    useThemeStore.getState().setMode("dark");

    const persisted = localStorage.getItem(PERSIST_KEY);
    expect(persisted).toBeTruthy();
    expect(persisted).toContain('"mode":"dark"');
  });

  it("store initialises from persisted value", async () => {
    localStorage.setItem(
      PERSIST_KEY,
      JSON.stringify({
        state: {
          mode: "light",
          resolvedMode: "light",
          colors: {
            primary: "#3b82f6",
            secondary: "#64748b",
            accent: "#8b5cf6",
            background: "#ffffff",
            surface: "#f8fafc",
            error: "#ef4444",
            warning: "#f59e0b",
            success: "#10b981",
            info: "#3b82f6",
          },
          font: {
            family: "Inter, system-ui, sans-serif",
            size: "md",
            lineHeight: "normal",
          },
          density: "comfortable",
          animationsEnabled: true,
          reducedMotion: false,
          customCssVars: {},
          activePresetId: "stellar",
          customPresets: [],
        },
        version: 2,
      })
    );

    await useThemeStore.persist.rehydrate();

    const state = useThemeStore.getState();
    expect(state.mode).toBe("light");
    expect(state.resolvedMode).toBe("light");
  });

  it("store uses default when no persisted value exists", () => {
    localStorage.clear();
    resetStoreState();

    const state = useThemeStore.getState();
    expect(state.mode).toBe("system");
    expect(state.resolvedMode).toBe("dark");
  });

  it("persistence key matches the exact key in themeStore.ts", () => {
    useThemeStore.getState().setMode("dark");

    const persisted = localStorage.getItem(PERSIST_KEY);
    expect(persisted).toBeTruthy();

    // Verify the key exists and matches
    const keys = Object.keys(localStorage);
    expect(keys).toContain(PERSIST_KEY);
  });

  it("setAnimationsEnabled updates animationsEnabled state", () => {
    useThemeStore.getState().setAnimationsEnabled(false);

    const state = useThemeStore.getState();
    expect(state.animationsEnabled).toBe(false);
  });

  it("setReducedMotion updates reducedMotion state", () => {
    useThemeStore.getState().setReducedMotion(true);

    const state = useThemeStore.getState();
    expect(state.reducedMotion).toBe(true);
  });

  it("resetTheme restores initial state", () => {
    const store = useThemeStore.getState();

    // Modify state
    store.setMode("light");
    store.setDensity("compact");
    store.setAnimationsEnabled(false);

    expect(useThemeStore.getState().mode).toBe("light");

    // Reset
    store.resetTheme();

    const state = useThemeStore.getState();
    expect(state.mode).toBe("system");
    expect(state.resolvedMode).toBe("dark");
    expect(state.density).toBe("comfortable");
    expect(state.animationsEnabled).toBe(true);
  });

  it("setPrimaryColor sets color and switches to custom preset", () => {
    useThemeStore.getState().setPrimaryColor("#ff0000");

    const state = useThemeStore.getState();
    expect(state.colors.primary).toBe("#ff0000");
    expect(state.activePresetId).toBe("custom");
  });

  it("setFontSize updates font size and switches to custom preset", () => {
    useThemeStore.getState().setFontSize("lg");

    const state = useThemeStore.getState();
    expect(state.font.size).toBe("lg");
    expect(state.activePresetId).toBe("custom");
  });
});
