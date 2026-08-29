import { useMemo, useState } from "react";
import {
  contrastRatio,
  getVisualizationTheme,
  getColorblindModePreference,
  setColorblindModePreference,
} from "../styles/colors";

function ColorRow({
  title,
  colors,
}: {
  title: string;
  colors: readonly string[];
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-white">{title}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {colors.map((color) => (
          <div key={color} className="rounded border border-stellar-border p-2">
            <div
              className="h-10 w-full rounded"
              style={{ backgroundColor: color }}
              aria-label={`${title} ${color}`}
            />
            <p className="mt-1 text-[11px] text-stellar-text-secondary">{color}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ColorPreviewTool() {
  const [colorblindMode, setColorblindMode] = useState(
    getColorblindModePreference()
  );

  const theme = useMemo(
    () => getVisualizationTheme({ theme: "dark", colorblindMode }),
    [colorblindMode]
  );

  const ratio = contrastRatio(theme.axis, "#0B0E1A").toFixed(2);

  return (
    <div className="space-y-4 rounded-lg border border-stellar-border bg-stellar-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Visualization color preview</h3>
        <label className="inline-flex items-center gap-2 text-sm text-stellar-text-secondary">
          <input
            type="checkbox"
            checked={colorblindMode}
            onChange={(event) => {
              setColorblindMode(event.target.checked);
              setColorblindModePreference(event.target.checked);
            }}
            className="h-4 w-4"
          />
          Colorblind friendly mode
        </label>
      </div>

      <p className="text-xs text-stellar-text-secondary">
        Axis contrast ratio against dashboard background: {ratio}:1
      </p>

      <ColorRow title="Categorical" colors={theme.categorical} />
      <ColorRow title="Sequential" colors={theme.sequential} />
      <ColorRow title="Diverging" colors={theme.diverging} />
      <ColorRow title="Status" colors={Object.values(theme.status)} />
    </div>
  );
}
