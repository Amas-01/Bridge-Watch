import type { FontSettings, ThemeColors } from "../stores/themeStore";

/**
 * Curated theme presets (light + dark) for quick visual styles.
 * Contrast targets follow WCAG-friendly pairings for body + surface.
 */
export type ThemePresetDefinition = {
  id: string;
  label: string;
  description: string;
  light: ThemeColors;
  dark: ThemeColors;
  font?: Partial<FontSettings>;
  density?: "compact" | "comfortable" | "spacious";
};

const baseLight: ThemeColors = {
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

const baseDark: ThemeColors = {
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

export const THEME_PRESETS: ThemePresetDefinition[] = [
  {
    id: "stellar",
    label: "Stellar Default",
    description: "Blue / violet balance used by the original Bridge Watch palette.",
    light: { ...baseLight },
    dark: { ...baseDark },
  },
  {
    id: "ocean",
    label: "Ocean",
    description: "Teal primary with cool neutrals for long monitoring sessions.",
    light: {
      ...baseLight,
      primary: "#0d9488",
      accent: "#0f766e",
      surface: "#f0fdfa",
    },
    dark: {
      ...baseDark,
      primary: "#2dd4bf",
      accent: "#5eead4",
      background: "#0c1a1d",
      surface: "#134e4a",
    },
    density: "comfortable",
  },
  {
    id: "ember",
    label: "Ember",
    description: "Warm amber accents for high-signal alerts and dashboards.",
    light: {
      ...baseLight,
      primary: "#ea580c",
      accent: "#f97316",
      warning: "#d97706",
      surface: "#fff7ed",
    },
    dark: {
      ...baseDark,
      primary: "#fb923c",
      accent: "#fdba74",
      warning: "#fbbf24",
      surface: "#292524",
      background: "#1c1210",
    },
  },
  {
    id: "forest",
    label: "Forest",
    description: "Green-forward palette emphasizing healthy / success states.",
    light: {
      ...baseLight,
      primary: "#15803d",
      accent: "#22c55e",
      success: "#16a34a",
      surface: "#f0fdf4",
    },
    dark: {
      ...baseDark,
      primary: "#4ade80",
      accent: "#86efac",
      success: "#4ade80",
      surface: "#14532d",
      background: "#0f1f14",
    },
    font: { size: "md", lineHeight: "normal", family: "Inter, system-ui, sans-serif" },
  },
];

export function getPresetById(id: string): ThemePresetDefinition | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}
