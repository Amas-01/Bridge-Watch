export const visualizationColors = {
  categorical: [
    "#2E86FF",
    "#00B894",
    "#F39C12",
    "#9B59B6",
    "#E74C3C",
    "#1ABC9C",
    "#3498DB",
    "#F1C40F",
  ],
  categoricalColorblind: [
    "#0072B2",
    "#009E73",
    "#E69F00",
    "#56B4E9",
    "#D55E00",
    "#CC79A7",
    "#F0E442",
    "#999999",
  ],
  sequential: ["#EAF2FF", "#C6DAFF", "#8FB6FF", "#5C91FF", "#2E6CFF", "#1147CC"],
  diverging: ["#B2182B", "#D6604D", "#F4A582", "#FDDBC7", "#D1E5F0", "#92C5DE", "#4393C3", "#2166AC"],
  status: {
    success: "#00C897",
    warning: "#F59E0B",
    error: "#EF4444",
    info: "#3B82F6",
  },
} as const;

export type ThemeMode = "dark" | "light";

export interface VisualizationThemeOptions {
  theme: ThemeMode;
  colorblindMode?: boolean;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);

  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const [R, G, B] = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(colorA: string, colorB: string): number {
  const lumA = luminance(colorA);
  const lumB = luminance(colorB);
  const brightest = Math.max(lumA, lumB);
  const darkest = Math.min(lumA, lumB);

  return (brightest + 0.05) / (darkest + 0.05);
}

export function generateDynamicColor(seed: string, saturation = 65, lightness = 52): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function getVisualizationTheme({
  theme,
  colorblindMode = false,
}: VisualizationThemeOptions) {
  const categorical = colorblindMode
    ? visualizationColors.categoricalColorblind
    : visualizationColors.categorical;

  return {
    grid: theme === "dark" ? "#1E2340" : "#D1D5DB",
    axis: theme === "dark" ? "#8A8FA8" : "#374151",
    tooltipBg: theme === "dark" ? "#141829" : "#FFFFFF",
    tooltipText: theme === "dark" ? "#FFFFFF" : "#0F172A",
    categorical,
    sequential: visualizationColors.sequential,
    diverging: visualizationColors.diverging,
    status: visualizationColors.status,
  };
}

const COLORBLIND_STORAGE_KEY = "bridgewatch.colorblindMode";

export function getColorblindModePreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(COLORBLIND_STORAGE_KEY) === "1";
}

export function setColorblindModePreference(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(COLORBLIND_STORAGE_KEY, enabled ? "1" : "0");
}
