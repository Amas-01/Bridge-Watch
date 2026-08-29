import { useWatchlist } from "../../hooks/useWatchlist";

interface AddToWatchlistButtonProps {
  symbol: string;
  className?: string;
}

export default function AddToWatchlistButton({
  symbol,
  className = "",
}: AddToWatchlistButtonProps) {
  const { isInWatchlist, addAsset, removeAsset } = useWatchlist();
  const inWatchlist = isInWatchlist(symbol);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();

        if (inWatchlist) {
          removeAsset(symbol);
          return;
        }

        addAsset(symbol);
      }}
      className={`rounded border border-stellar-border px-2.5 py-1 text-xs text-stellar-text-secondary transition hover:text-white ${className}`}
      aria-pressed={inWatchlist}
      aria-label={inWatchlist ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
    >
      {inWatchlist ? "★ Watching" : "+ Watch"}
    </button>
  );
}
