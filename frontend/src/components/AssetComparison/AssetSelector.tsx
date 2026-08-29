import { useMemo } from "react";
import type { AssetWithHealth } from "../../types";

interface Props {
  assets: AssetWithHealth[];
  selected: string[];
  max: number;
  onToggle: (symbol: string) => void;
  isLoading: boolean;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

function normalizeCategory(value?: string | null) {
  const normalized = (value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");

  if (!normalized) return "other";
  if (["stablecoin", "stablecoins"].includes(normalized)) return "stablecoin";
  if (["real-world-asset", "real-world-assets", "realworldasset", "rwa"].includes(normalized)) {
    return "real-world-asset";
  }
  if (["native", "native-asset"].includes(normalized)) return "native";
  if (["bridged", "bridge", "bridged-asset"].includes(normalized)) return "bridged";
  if (["wrapped", "wrapped-asset"].includes(normalized)) return "wrapped";

  return normalized;
}

function getCategoryLabel(category: string) {
  switch (category) {
    case "stablecoin":
      return "Stablecoins";
    case "real-world-asset":
      return "RWA";
    case "native":
      return "Native";
    case "bridged":
      return "Bridged";
    case "wrapped":
      return "Wrapped";
    case "other":
      return "Other";
    default:
      return category.charAt(0).toUpperCase() + category.slice(1);
  }
}

export default function AssetSelector({
  assets,
  selected,
  max,
  onToggle,
  isLoading,
  activeCategory,
  onCategoryChange,
}: Props) {
  const categories = useMemo(() => {
    const available = new Set<string>();
    assets.forEach((asset) => available.add(normalizeCategory(asset.category)));
    return ["all", ...Array.from(available)];
  }, [assets]);

  const visibleAssets = useMemo(() => {
    if (activeCategory === "all") return assets;
    return assets.filter((asset) => normalizeCategory(asset.category) === activeCategory);
  }, [activeCategory, assets]);

  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 w-16 bg-stellar-border/30 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-stellar-text-secondary mb-2">
        Select up to {max} assets to compare. {selected.length}/{max} selected.
      </p>

      <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Filter assets by category">
        {categories.map((category) => {
          const isActive = activeCategory === category;
          return (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onCategoryChange(category)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                isActive
                  ? "border-stellar-blue bg-stellar-blue/15 text-white"
                  : "border-stellar-border text-stellar-text-secondary hover:border-stellar-blue/50 hover:text-white"
              }`}
            >
              {category === "all" ? "All" : getCategoryLabel(category)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Asset selection">
        {visibleAssets.length === 0 ? (
          <p className="text-sm text-stellar-text-muted">No assets available in this category.</p>
        ) : (
          visibleAssets.map((a) => {
            const isSelected = selected.includes(a.symbol);
            const isDisabled = !isSelected && selected.length >= max;
            return (
              <button
                key={a.symbol}
                type="button"
                onClick={() => onToggle(a.symbol)}
                disabled={isDisabled}
                aria-pressed={isSelected}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-stellar-blue ${
                  isSelected
                    ? "bg-stellar-blue text-white"
                    : isDisabled
                      ? "border border-stellar-border text-stellar-text-muted opacity-50 cursor-not-allowed"
                      : "border border-stellar-border text-stellar-text-secondary hover:text-white hover:border-stellar-blue/50"
                }`}
              >
                {a.symbol}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
