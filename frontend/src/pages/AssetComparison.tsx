import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAssetsWithHealth } from "../hooks/useAssets";
import { useLocalStorageState } from "../hooks/useLocalStorageState";
import { AssetSelector, AssetComparisonMatrix, PriceSourceCoverageMatrix } from "../components/AssetComparison";
import { getAssetMetadataBySymbol } from "../services/api";

const MAX_COMPARE = 8;
const STORAGE_KEY = "bridge-watch:asset-comparison:v1";

export default function AssetComparison() {
  const { data: allAssets = [], isLoading, error } = useAssetsWithHealth();
  const [selected, setSelected] = useLocalStorageState<string[]>(STORAGE_KEY, []);
  const [filter, setFilter] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const metadataQuery = useQuery({
    queryKey: ["asset-comparison-metadata", allAssets.map((asset) => asset.symbol).join("|")],
    queryFn: async () => {
      const metadataEntries = await Promise.all(
        allAssets.map(async (asset) => {
          try {
            const metadata = await getAssetMetadataBySymbol(asset.symbol);
            return [asset.symbol, metadata.category ?? null] as const;
          } catch {
            return [asset.symbol, null] as const;
          }
        })
      );

      return Object.fromEntries(metadataEntries) as Record<string, string | null>;
    },
    enabled: allAssets.length > 0,
  });

  const assetsWithCategories = useMemo(() => {
    const metadataMap = metadataQuery.data ?? {};
    return allAssets.map((asset) => ({
      ...asset,
      category: metadataMap[asset.symbol] ?? asset.category ?? null,
    }));
  }, [allAssets, metadataQuery.data]);

  const selectedAssets = useMemo(
    () => assetsWithCategories.filter((asset) => selected.includes(asset.symbol)),
    [assetsWithCategories, selected]
  );

  function toggleAsset(symbol: string) {
    setSelected((prev) => {
      if (prev.includes(symbol)) return prev.filter((s) => s !== symbol);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, symbol];
    });
  }

  function clearAll() {
    setSelected([]);
    setFilter("");
    setActiveCategory("all");
  }

  const avgHealth =
    selectedAssets.length > 0
      ? Math.round(
          selectedAssets.reduce((sum, a) => sum + (a.health?.overallScore ?? 0), 0) /
            selectedAssets.length
        )
      : null;

  const best =
    selectedAssets.length > 0
      ? selectedAssets.reduce(
          (prev, curr) =>
            (curr.health?.overallScore ?? 0) > (prev.health?.overallScore ?? 0) ? curr : prev,
          selectedAssets[0]
        )
      : null;

  const worst =
    selectedAssets.length > 0
      ? selectedAssets.reduce(
          (prev, curr) =>
            (curr.health?.overallScore ?? 101) < (prev.health?.overallScore ?? 101) ? curr : prev,
          selectedAssets[0]
        )
      : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-white">Asset Comparison Matrix</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Select multiple assets and compare them side-by-side across all health metrics.
        </p>
      </header>

      {/* Asset selection */}
      <section className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Select Assets</h2>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-stellar-text-secondary hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        {error ? (
          <p className="text-red-400 text-sm">Failed to load assets. Please try again.</p>
        ) : (
          <AssetSelector
            assets={assetsWithCategories}
            selected={selected}
            max={MAX_COMPARE}
            onToggle={toggleAsset}
            isLoading={isLoading}
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
          />
        )}
      </section>

      {/* Summary stats for selected assets */}
      {selectedAssets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-stellar-card border border-stellar-border rounded-lg p-4">
            <p className="text-xs text-stellar-text-secondary uppercase tracking-wide">Assets Selected</p>
            <p className="mt-1 text-2xl font-bold text-white">{selectedAssets.length}</p>
          </div>
          <div className="bg-stellar-card border border-stellar-border rounded-lg p-4">
            <p className="text-xs text-stellar-text-secondary uppercase tracking-wide">Average Health</p>
            <p
              className={`mt-1 text-2xl font-bold ${
                avgHealth !== null
                  ? avgHealth >= 80
                    ? "text-green-400"
                    : avgHealth >= 50
                      ? "text-yellow-400"
                      : "text-red-400"
                  : "text-white"
              }`}
            >
              {avgHealth ?? "—"}
            </p>
          </div>
          <div className="bg-stellar-card border border-stellar-border rounded-lg p-4">
            <p className="text-xs text-stellar-text-secondary uppercase tracking-wide">Best / Worst</p>
            <p className="mt-1 text-sm font-semibold text-white">
              <span className="text-green-400">{best?.symbol ?? "—"}</span>
              {" · "}
              <span className="text-red-400">{worst?.symbol !== best?.symbol ? (worst?.symbol ?? "—") : "—"}</span>
            </p>
          </div>
        </div>
      )}

      {/* Filter + matrix */}
      <section className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <h2 className="text-lg font-semibold text-white">Comparison Matrix</h2>
          {selectedAssets.length > 0 && (
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter assets…"
              className="rounded-lg border border-stellar-border bg-stellar-dark px-3 py-2 text-sm text-white placeholder:text-stellar-text-muted focus:outline-none focus:ring-2 focus:ring-stellar-blue w-full sm:w-56"
              aria-label="Filter assets in matrix"
            />
          )}
        </div>

        <AssetComparisonMatrix assets={selectedAssets} filter={filter} />
      </section>

      {/* Price source coverage */}
      <section className="bg-stellar-card border border-stellar-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-white mb-5">Price Source Coverage</h2>
        <PriceSourceCoverageMatrix symbols={selectedAssets.map((asset) => asset.symbol)} />
      </section>
    </div>
  );
}
