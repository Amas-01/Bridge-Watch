import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { devtools } from "zustand/middleware";
import { getPresetById } from "../theme/themePresets";

export type ThemeMode = "light" | "dark" | "system";

export interface ThemeColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  error: string;
  warning: string;
  success: string;
  info: string;
}

export interface FontSettings {
  family: string;
  size: "sm" | "md" | "lg";
  lineHeight: "tight" | "normal" | "relaxed";
}

export interface CustomPresetSnapshot {
  id: string;
  label: string;
  colorsLight: ThemeColors;
  colorsDark: ThemeColors;
  font: FontSettings;
  density: "compact" | "comfortable" | "spacious";
}

export interface ThemeState {
  // Theme mode
  mode: ThemeMode;
  resolvedMode: "light" | "dark";

  // Color scheme
  colors: ThemeColors;

  // Font settings
  font: FontSettings;

  // UI density
  density: "compact" | "comfortable" | "spacious";

  // Animation preferences
  animationsEnabled: boolean;
  reducedMotion: boolean;

  // Custom CSS variables
  customCssVars: Record<string, string>;

  /** Built-in preset id from {@link ../theme/themePresets}, `custom`, or a saved preset id */
  activePresetId: string;
  /** User-saved theme snapshots (light + dark) */
  customPresets: CustomPresetSnapshot[];
}

export interface ThemeActions {
  // Mode actions
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setResolvedMode: (mode: "light" | "dark") => void;

  // Color actions
  setPrimaryColor: (color: string) => void;
  setAccentColor: (color: string) => void;
  resetColors: () => void;

  // Font actions
  setFontFamily: (family: string) => void;
  setFontSize: (size: FontSettings["size"]) => void;
  setLineHeight: (lineHeight: FontSettings["lineHeight"]) => void;

  // Density actions
  setDensity: (density: ThemeState["density"]) => void;

  // Animation actions
  setAnimationsEnabled: (enabled: boolean) => void;
  setReducedMotion: (reduced: boolean) => void;

  // Custom CSS actions
  setCustomCssVar: (name: string, value: string) => void;
  removeCustomCssVar: (name: string) => void;

  // Apply theme to document
  applyTheme: () => void;

  // Reset
  resetTheme: () => void;

  // Presets (library + user snapshots)
  applyLibraryPreset: (id: string) => void;
  applySavedCustomPreset: (id: string) => void;
  saveCurrentAsCustomPreset: (label: string) => void;
  removeCustomPreset: (id: string) => void;
}

const defaultLightColors: ThemeColors = {
  primary: "#3b82f6",
  secondary: "#64748b",
  accent: "#8b5cf6",
  background: "#ffffff",
  surface: "#f8fafc",
  error: "#ef4444",
  warning: "#f59e0b",
  success: "#10b981",
  info: "#3b82f6",
};

const defaultDarkColors: ThemeColors = {
  primary: "#60a5fa",
  secondary: "#94a3b8",
  accent: "#a78bfa",
  background: "#0f172a",
  surface: "#1e293b",
  error: "#f87171",
  warning: "#fbbf24",
  success: "#34d399",
  info: "#60a5fa",
};

const stellarBoot = getPresetById("stellar");

const initialThemeState: ThemeState = {
  mode: "system",
  resolvedMode: "dark",
  colors: stellarBoot ? stellarBoot.dark : defaultDarkColors,
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
};

const getSystemTheme = (): "light" | "dark" => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
};

function resolveColorsForMode(
  activePresetId: string,
  resolvedMode: "light" | "dark",
  customPresets: CustomPresetSnapshot[]
): ThemeColors {
  if (activePresetId === "custom") {
    return resolvedMode === "dark" ? defaultDarkColors : defaultLightColors;
  }
  const lib = getPresetById(activePresetId);
  if (lib) {
    return resolvedMode === "dark" ? lib.dark : lib.light;
  }
  const saved = customPresets.find((p) => p.id === activePresetId);
  if (saved) {
    return resolvedMode === "dark" ? saved.colorsDark : saved.colorsLight;
  }
  return resolvedMode === "dark" ? defaultDarkColors : defaultLightColors;
}

export const useThemeStore = create<ThemeState & ThemeActions>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialThemeState,

        setMode: (mode) => {
          const resolvedMode = mode === "system" ? getSystemTheme() : mode;
          const { activePresetId, customPresets } = get();
          const colors = resolveColorsForMode(activePresetId, resolvedMode, customPresets);
          set({ mode, resolvedMode, colors }, false, `setMode/${mode}`);
          get().applyTheme();
        },

        toggleMode: () => {
          const current = get().resolvedMode;
          const newMode = current === "dark" ? "light" : "dark";
          const { activePresetId, customPresets } = get();
          const colors = resolveColorsForMode(activePresetId, newMode, customPresets);
          set(
            { resolvedMode: newMode, colors, mode: newMode },
            false,
            "toggleMode"
          );
          get().applyTheme();
        },

        setResolvedMode: (mode) => {
          const { activePresetId, customPresets } = get();
          const colors = resolveColorsForMode(activePresetId, mode, customPresets);
          set({ resolvedMode: mode, colors }, false, "setResolvedMode");
          get().applyTheme();
        },

        setPrimaryColor: (color) => {
          set(
            {
              colors: { ...get().colors, primary: color },
              activePresetId: "custom",
            },
            false,
            "setPrimaryColor"
          );
          get().applyTheme();
        },

        setAccentColor: (color) => {
          set(
            {
              colors: { ...get().colors, accent: color },
              activePresetId: "custom",
            },
            false,
            "setAccentColor"
          );
          get().applyTheme();
        },

        resetColors: () => {
          const { resolvedMode, activePresetId, customPresets } = get();
          const colors = resolveColorsForMode(activePresetId, resolvedMode, customPresets);
          set({ colors }, false, "resetColors");
          get().applyTheme();
        },

        setFontFamily: (family) => {
          set(
            { font: { ...get().font, family }, activePresetId: "custom" },
            false,
            "setFontFamily"
          );
        },

        setFontSize: (size) => {
          set(
            { font: { ...get().font, size }, activePresetId: "custom" },
            false,
            "setFontSize"
          );
        },

        setLineHeight: (lineHeight) => {
          set(
            {
              font: { ...get().font, lineHeight },
              activePresetId: "custom",
            },
            false,
            "setLineHeight"
          );
        },

        setDensity: (density) => {
          set({ density, activePresetId: "custom" }, false, "setDensity");
        },

        setAnimationsEnabled: (enabled) => {
          set({ animationsEnabled: enabled }, false, "setAnimationsEnabled");
        },

        setReducedMotion: (reduced) => {
          set({ reducedMotion: reduced }, false, "setReducedMotion");
        },

        setCustomCssVar: (name, value) => {
          set(
            {
              customCssVars: { ...get().customCssVars, [name]: value },
            },
            false,
            "setCustomCssVar"
          );
        },

        removeCustomCssVar: (name) => {
          const rest = Object.fromEntries(
            Object.entries(get().customCssVars).filter(([key]) => key !== name)
          );
          set({ customCssVars: rest }, false, "removeCustomCssVar");
        },

        applyTheme: () => {
          if (typeof document === "undefined") return;

          const { resolvedMode, colors, customCssVars } = get();
          const root = document.documentElement;

          // Set theme attribute
          root.setAttribute("data-theme", resolvedMode);
          root.setAttribute("data-density", get().density);

          // Apply color variables
          Object.entries(colors).forEach(([key, value]) => {
            root.style.setProperty(`--color-${key}`, value);
          });

          // Apply custom CSS variables
          Object.entries(customCssVars).forEach(([key, value]) => {
            root.style.setProperty(key, value);
          });
        },

        resetTheme: () => {
          set(initialThemeState, false, "resetTheme");
          get().applyTheme();
        },

        applyLibraryPreset: (id) => {
          const def = getPresetById(id);
          if (!def) return;
          const rm = get().resolvedMode;
          const colors = rm === "dark" ? def.dark : def.light;
          const font = def.font ? { ...get().font, ...def.font } : get().font;
          const density = def.density ?? get().density;
          set(
            {
              activePresetId: id,
              colors,
              font,
              density,
            },
            false,
            `applyLibraryPreset/${id}`
          );
          get().applyTheme();
        },

        applySavedCustomPreset: (id) => {
          const snap = get().customPresets.find((p) => p.id === id);
          if (!snap) return;
          const rm = get().resolvedMode;
          const colors = rm === "dark" ? snap.colorsDark : snap.colorsLight;
          set(
            {
              activePresetId: id,
              colors,
              font: snap.font,
              density: snap.density,
            },
            false,
            `applySavedCustomPreset/${id}`
          );
          get().applyTheme();
        },

        saveCurrentAsCustomPreset: (label) => {
          const labelTrim = label.trim();
          if (!labelTrim) return;
          const genId =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? `saved-${crypto.randomUUID()}`
              : `saved-${Date.now()}`;
          const state = get();
          const rm = state.resolvedMode;
          const cur = state.colors;
          const colorsLight = rm === "light" ? { ...cur } : { ...defaultLightColors };
          const colorsDark = rm === "dark" ? { ...cur } : { ...defaultDarkColors };
          const snapshot: CustomPresetSnapshot = {
            id: genId,
            label: labelTrim,
            colorsLight,
            colorsDark,
            font: state.font,
            density: state.density,
          };
          set(
            {
              customPresets: [...state.customPresets, snapshot],
              activePresetId: genId,
            },
            false,
            "saveCurrentAsCustomPreset"
          );
          get().applyTheme();
        },

        removeCustomPreset: (id) => {
          const state = get();
          const next = state.customPresets.filter((p) => p.id !== id);
          let activePresetId = state.activePresetId;
          if (activePresetId === id) {
            activePresetId = "stellar";
          }
          const rm = state.resolvedMode;
          const colors = resolveColorsForMode(activePresetId, rm, next);
          set(
            {
              customPresets: next,
              activePresetId,
              colors,
            },
            false,
            "removeCustomPreset"
          );
          get().applyTheme();
        },
      }),
      {
        name: "bridge-watch-theme",
        storage: createJSONStorage(() => localStorage),
        version: 2,
        migrate: (persisted: unknown, version: number) => {
          const p = persisted as Record<string, unknown>;
          if (version < 2) {
            return {
              ...p,
              activePresetId: typeof p.activePresetId === "string" ? p.activePresetId : "stellar",
              customPresets: Array.isArray(p.customPresets)
                ? (p.customPresets as CustomPresetSnapshot[])
                : [],
            };
          }
          return persisted;
        },
        partialize: (state) => ({
          mode: state.mode,
          colors: state.colors,
          font: state.font,
          density: state.density,
          animationsEnabled: state.animationsEnabled,
          reducedMotion: state.reducedMotion,
          customCssVars: state.customCssVars,
          activePresetId: state.activePresetId,
          customPresets: state.customPresets,
        }),
      }
    ),
    { name: "ThemeStore" }
  )
);

// Selectors for optimized re-renders
export const selectThemeMode = (state: ThemeState & ThemeActions) =>
  state.mode;

export const selectResolvedMode = (state: ThemeState & ThemeActions) =>
  state.resolvedMode;

export const selectIsDarkMode = (state: ThemeState & ThemeActions) =>
  state.resolvedMode === "dark";

export const selectThemeColors = (state: ThemeState & ThemeActions) =>
  state.colors;

export const selectFontSettings = (state: ThemeState & ThemeActions) =>
  state.font;

export const selectDensity = (state: ThemeState & ThemeActions) =>
  state.density;

export const selectAnimationSettings = (state: ThemeState & ThemeActions) => ({
  animationsEnabled: state.animationsEnabled,
  reducedMotion: state.reducedMotion,
});
