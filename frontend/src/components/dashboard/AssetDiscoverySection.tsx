import { useMemo, useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import HealthScoreCard from "../HealthScoreCard";
import FavoriteTagChip from "../favorites/FavoriteTagChip";
import AddToWatchlistButton from "../watchlist/AddToWatchlistButton";
import type { AssetWithHealth } from "../../types";
import { useUserPreferencesStore } from "../../stores/userPreferencesStore";
import { useFavorites } from "../../hooks/useFavorites";
import { useUIStore } from "../../stores/uiStore";

function chunkAssets<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

function scoreValue(asset: AssetWithHealth): number {
  return asset.health?.overallScore ?? -1;
}

function useColumnCount(): number {
  const [cols, setCols] = useState(3);
  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 768) setCols(1);
      else if (w < 1024) setCols(2);
      else setCols(3);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return cols;
}

export interface AssetDiscoverySectionProps {
  assets: AssetWithHealth[];
  isLoading: boolean;
}

export default function AssetDiscoverySection({
  assets,
  isLoading,
}: AssetDiscoverySectionProps) {
  const dashboardLayout = useUserPreferencesStore((s) => s.dashboardLayout);
  const setPreference = useUserPreferencesStore((s) => s.setPreference);
  const assetSort = useUserPreferencesStore((s) => s.assetSort);
  const {
    favoritesFilterMode,
    setFavoritesFilterMode,
    toggleFavoriteAsset,
  } = useFavorites();
  const favoriteAssets = useUserPreferencesStore((s) => s.favoriteAssets);
  const openInsightsTray = useUIStore((s) => s.openInsightsTray);

  const cols = useColumnCount();
  const parentRef = useRef<HTMLDivElement>(null);

  const processed = useMemo(() => {
    let list = [...assets];
    if (favoritesFilterMode === "favorites") {
      list = list.filter((a) => favoriteAssets.includes(a.symbol));
    }
    list.sort((a, b) => {
      if (assetSort === "health") {
        return scoreValue(b) - scoreValue(a);
      }
      return a.symbol.localeCompare(b.symbol);
    });
    return list;
  }, [assets, assetSort, favoritesFilterMode, favoriteAssets]);

  const listMode = dashboardLayout === "list";
  const gridColsClass =
    cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : "grid-cols-3";

  const rows = useMemo(() => {
    if (listMode) {
      return processed.map((a) => [a]);
    }
    return chunkAssets(processed, cols);
  }, [processed, cols, listMode]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => (listMode ? 440 : 400),
    overscan: 3,
  });

  if (isLoading) {
    return <p className="text-stellar-text-secondary">Loading assets...</p>;
  }

  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-8 text-center">
        <p className="text-stellar-text-secondary">
          No monitored assets yet. Configure assets in the backend to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-stellar-text-secondary">Layout</span>
          <div className="inline-flex rounded-full border border-stellar-border p-0.5">
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                dashboardLayout === "grid"
                  ? "bg-stellar-blue text-white"
                  : "text-stellar-text-secondary hover:text-white"
              }`}
              aria-pressed={dashboardLayout === "grid"}
              onClick={() => setPreference("dashboardLayout", "grid")}
            >
              Grid
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                dashboardLayout === "list"
                  ? "bg-stellar-blue text-white"
                  : "text-stellar-text-secondary hover:text-white"
              }`}
              aria-pressed={dashboardLayout === "list"}
              onClick={() => setPreference("dashboardLayout", "list")}
            >
              List
            </button>
          </div>

          <span className="text-sm text-stellar-text-secondary lg:ml-2">Sort</span>
          <select
            value={assetSort}
            onChange={(e) =>
              setPreference("assetSort", e.target.value as "symbol" | "health")
            }
            className="rounded-md border border-stellar-border bg-stellar-card px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            aria-label="Sort assets"
          >
            <option value="symbol">Symbol (A–Z)</option>
            <option value="health">Health score</option>
          </select>

          <div className="inline-flex rounded-full border border-stellar-border p-0.5">
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                favoritesFilterMode === "all"
                  ? "bg-stellar-blue text-white"
                  : "text-stellar-text-secondary hover:text-white"
              }`}
              aria-pressed={favoritesFilterMode === "all"}
              onClick={() => setFavoritesFilterMode("all")}
            >
              All assets
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                favoritesFilterMode === "favorites"
                  ? "bg-stellar-blue text-white"
                  : "text-stellar-text-secondary hover:text-white"
              }`}
              aria-pressed={favoritesFilterMode === "favorites"}
              onClick={() => setFavoritesFilterMode("favorites")}
            >
              Favorites only
            </button>
          </div>
        </div>
      </div>

      {processed.length === 0 ? (
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-8 text-center">
          <p className="text-stellar-text-secondary">
            No assets match this filter. Clear favorites-only or star assets from each card.
          </p>
        </div>
      ) : (
        <div
          ref={parentRef}
          className="max-h-[min(70vh,900px)] overflow-auto rounded-xl border border-stellar-border/60 pr-1"
          role="region"
          aria-label="Asset grid"
        >
          <div
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full px-1 pb-6"
                  style={{
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <div className={`grid gap-6 ${listMode ? "grid-cols-1" : gridColsClass}`}>
                    {row.map((asset) => (
                      <div key={asset.symbol} className="space-y-2">
                        <div className="flex justify-end gap-2">
                          <FavoriteTagChip
                            compact
                            label={asset.symbol}
                            active={favoriteAssets.includes(asset.symbol)}
                            onToggle={() => toggleFavoriteAsset(asset.symbol)}
                          />
                          <AddToWatchlistButton symbol={asset.symbol} />
                        </div>
                        <Link to={`/assets/${asset.symbol}`} className="group block">
                          <div className="rounded-lg transition-shadow group-hover:shadow-lg group-hover:shadow-stellar-blue/10">
                            <HealthScoreCard
                              symbol={asset.symbol}
                              name={asset.name}
                              overallScore={asset.health?.overallScore ?? null}
                              factors={asset.health?.factors ?? null}
                              trend={asset.health?.trend ?? null}
                              compact={listMode}
                            />
                          </div>
                          {asset.health ? (
                            <p className="mt-2 px-1 text-xs text-stellar-text-secondary md:hidden">
                              Score {asset.health.overallScore} · {asset.health.trend ?? "stable"}
                            </p>
                          ) : null}
                        </Link>
                        <button
                          type="button"
                          onClick={() => openInsightsTray(asset.symbol)}
                          className="w-full rounded-md border border-stellar-border px-3 py-2 text-xs font-medium text-stellar-text-secondary transition-colors hover:border-stellar-blue hover:text-white focus:outline-none focus:ring-2 focus:ring-stellar-blue"
                          aria-label={`Open insights for ${asset.name ?? asset.symbol}`}
                        >
                          Insights
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
