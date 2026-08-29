import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useWatchlist } from "../hooks/useWatchlist";
import { WatchlistManager } from "../components/WatchlistManager";
import { AssetWatchlistButton } from "../components/AssetWatchlistButton";
import { getAssetPrice, getAssetHealth } from "../services/api";
import type { HealthScore } from "../types";
import { Link } from "react-router-dom";

interface AssetDetails {
  price: {
    symbol: string;
    vwap: number;
    sources: Array<{ source: string; price: number; timestamp: string }>;
    deviation: number;
    lastUpdated: string;
  } | null;
  health: HealthScore | null;
}

export default function WatchlistPage() {
  const { activeWatchlist, watchlists, addAsset, removeAsset, importWatchlists } =
    useWatchlist();
  const [searchParams, setSearchParams] = useSearchParams();
  const [assetDetails, setAssetDetails] = useState<Record<string, AssetDetails>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveTargetId, setMoveTargetId] = useState("");

  useEffect(() => {
    setSelected(new Set());
  }, [activeWatchlist?.id]);

  const toggleSelected = (symbol: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!activeWatchlist) return;
    setSelected((previous) =>
      previous.size === activeWatchlist.assets.length
        ? new Set()
        : new Set(activeWatchlist.assets)
    );
  };

  const handleRemoveSelected = () => {
    if (!activeWatchlist) return;
    for (const symbol of selected) {
      removeAsset(symbol, activeWatchlist.id);
    }
    setSelected(new Set());
  };

  const handleMoveSelected = () => {
    if (!activeWatchlist || !moveTargetId) return;
    for (const symbol of selected) {
      addAsset(symbol, moveTargetId);
      removeAsset(symbol, activeWatchlist.id);
    }
    setSelected(new Set());
    setMoveTargetId("");
  };

  // Handle shared link import
  useEffect(() => {
    const importParam = searchParams.get("import");
    if (importParam) {
      try {
        const decoded = atob(importParam);
        const success = importWatchlists(decoded);
        if (success) {
          alert("Shared watchlist imported successfully!");
          setSearchParams({});
        }
      } catch (err) {
        console.error("Failed to decode shared watchlist", err);
      }
    }
  }, [searchParams, importWatchlists, setSearchParams]);

  useEffect(() => {
    if (!activeWatchlist || activeWatchlist.assets.length === 0) return;

    const fetchDetails = async () => {
      setIsLoading(true);
      try {
        const details: Record<string, AssetDetails> = {};
        await Promise.all(
          activeWatchlist.assets.map(async (symbol) => {
            try {
              const [price, health] = await Promise.all([
                getAssetPrice(symbol),
                getAssetHealth(symbol),
              ]);
              details[symbol] = { price, health };
            } catch (err) {
              console.error(`Failed to fetch stats for ${symbol}`, err);
            }
          })
        );
        setAssetDetails(details);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [activeWatchlist?.assets]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white">Watchlists</h1>
          <p className="text-stellar-text-secondary mt-1">
            Monitor and manage your custom asset watchlists.
          </p>
        </div>
      </div>

      {activeWatchlist && (
        <div className="bg-stellar-card border border-stellar-border rounded-lg overflow-hidden shadow-lg">
          <div className="p-6 border-b border-stellar-border">
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              {activeWatchlist.name}
              <span className="text-sm font-normal text-stellar-blue bg-stellar-dark px-2 py-0.5 rounded-full">
                Active
              </span>
            </h2>
          </div>

          {selected.size > 0 && (
            <div
              className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-stellar-border bg-stellar-dark/60"
              role="toolbar"
              aria-label="Bulk watchlist actions"
            >
              <span className="text-sm text-stellar-text-secondary">
                {selected.size} selected
              </span>
              <button
                onClick={handleRemoveSelected}
                className="text-sm text-red-500 hover:text-red-400 transition-colors"
              >
                Remove Selected
              </button>
              <div className="flex items-center gap-2">
                <select
                  value={moveTargetId}
                  onChange={(e) => setMoveTargetId(e.target.value)}
                  className="bg-stellar-card border border-stellar-border text-white text-sm rounded-lg px-2 py-1"
                >
                  <option value="">Move to watchlist…</option>
                  {watchlists
                    .filter((list) => list.id !== activeWatchlist.id)
                    .map((list) => (
                      <option key={list.id} value={list.id}>
                        {list.name}
                      </option>
                    ))}
                </select>
                <button
                  onClick={handleMoveSelected}
                  disabled={!moveTargetId}
                  className="text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Move
                </button>
              </div>
            </div>
          )}

          {activeWatchlist.assets.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <div className="inline-block p-4 rounded-full bg-stellar-dark mb-4">
                <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-lg mb-2">No assets in this watchlist yet.</p>
              <p className="text-sm">Browse the dashboard and click the star icon to add assets here.</p>
              <Link to="/dashboard" className="mt-4 inline-block text-stellar-blue hover:text-blue-300">
                Go to Dashboard &rarr;
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-stellar-dark border-b border-stellar-border">
                  <tr>
                    <th className="px-6 py-4 text-left w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all assets"
                        checked={
                          activeWatchlist.assets.length > 0 &&
                          selected.size === activeWatchlist.assets.length
                        }
                        onChange={toggleSelectAll}
                        className="rounded border-stellar-border"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-stellar-text-secondary uppercase tracking-wider">
                      Asset
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-stellar-text-secondary uppercase tracking-wider">
                      Price (USD)
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-stellar-text-secondary uppercase tracking-wider">
                      Health Score
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-stellar-text-secondary uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stellar-border">
                  {activeWatchlist.assets.map((symbol) => {
                    const data = assetDetails[symbol];
                    const healthScore = data?.health?.overallScore;
                    return (
                      <tr key={symbol} className="hover:bg-stellar-dark/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <input
                            type="checkbox"
                            aria-label={`Select ${symbol}`}
                            checked={selected.has(symbol)}
                            onChange={() => toggleSelected(symbol)}
                            className="rounded border-stellar-border"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Link to={`/assets/${symbol}`} className="flex items-center gap-3 group">
                            <div className="w-8 h-8 rounded-full bg-stellar-blue/10 flex items-center justify-center border border-stellar-blue/20 group-hover:border-stellar-blue transition-colors">
                              <span className="text-sm font-bold text-stellar-blue">{symbol.slice(0, 2)}</span>
                            </div>
                            <span className="font-medium text-white group-hover:text-stellar-blue transition-colors">{symbol}</span>
                          </Link>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className="text-white font-mono">
                            {isLoading ? "..." : data?.price?.vwap ? `$${data.price.vwap.toFixed(4)}` : "—"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            typeof healthScore === "number" && healthScore >= 80 ? "bg-green-400/10 text-green-400 border-green-400/20" :
                            typeof healthScore === "number" && healthScore >= 50 ? "bg-yellow-400/10 text-yellow-400 border-yellow-400/20" :
                            "bg-red-400/10 text-red-400 border-red-400/20"
                          }`}>
                            {isLoading ? "..." : healthScore ?? "—"}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <AssetWatchlistButton symbol={symbol} size="lg" className="p-2" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Watchlist Manager */}
      <WatchlistManager />
    </div>
  );
}
