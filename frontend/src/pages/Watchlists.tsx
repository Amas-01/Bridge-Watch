import Watchlist from "../components/watchlist/Watchlist";

export default function WatchlistsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-white">Watchlists</h1>
        <p className="mt-2 text-stellar-text-secondary">
          Track favorite assets, organize multiple watchlists, and focus updates.
        </p>
      </div>

      <Watchlist />
    </div>
  );
}
