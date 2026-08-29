import { useQueries } from "@tanstack/react-query";
import { getAssetPrice } from "../../services/api";

interface Props {
  symbols: string[];
}

const SOURCE_ORDER = ["stellar_dex", "stellar_amm", "circle", "coinbase"] as const;

const SOURCE_LABELS: Record<string, string> = {
  stellar_dex: "Stellar DEX",
  stellar_amm: "Stellar AMM",
  circle: "Circle",
  coinbase: "Coinbase",
};

function normalizeSourceId(source: string): string | null {
  const s = source.trim().toLowerCase();

  if (s === "sdex" || s.includes("stellar dex") || s.includes("stellar_dex")) return "stellar_dex";
  if (s === "amm" || s.includes("stellar amm") || s.includes("stellar_amm")) return "stellar_amm";
  if (s.includes("circle")) return "circle";
  if (s.includes("coinbase")) return "coinbase";

  return null;
}

/**
 * PriceSourceCoverageMatrix — for each selected asset, shows which price
 * sources currently report data, so gaps in source coverage are easy to spot.
 */
export default function PriceSourceCoverageMatrix({ symbols }: Props) {
  const priceQueries = useQueries({
    queries: symbols.map((symbol) => ({
      queryKey: ["asset-price", symbol],
      queryFn: () => getAssetPrice(symbol),
      enabled: !!symbol,
      staleTime: 15_000,
    })),
  });

  if (symbols.length === 0) {
    return (
      <div className="text-center py-12 text-stellar-text-secondary text-sm">
        Select assets above to see their price source coverage.
      </div>
    );
  }

  const isLoading = priceQueries.some((q) => q.isLoading);

  const coverageBySymbol = new Map<string, Set<string>>();
  symbols.forEach((symbol, idx) => {
    const sources = priceQueries[idx]?.data?.sources ?? [];
    const covered = new Set<string>();
    for (const source of sources) {
      const id = normalizeSourceId(source.source);
      if (id) covered.add(id);
    }
    coverageBySymbol.set(symbol, covered);
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Price source coverage by asset</caption>
        <thead>
          <tr className="text-left text-stellar-text-secondary border-b border-stellar-border">
            <th scope="col" className="pb-3 pr-4 font-medium">Source</th>
            {symbols.map((symbol) => (
              <th key={symbol} scope="col" className="pb-3 pr-4 font-medium text-center">
                {symbol}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-stellar-text-primary">
          {SOURCE_ORDER.map((sourceId) => (
            <tr key={sourceId} className="border-b border-stellar-border/50 last:border-0">
              <td className="py-3 pr-4 font-medium">{SOURCE_LABELS[sourceId]}</td>
              {symbols.map((symbol) => {
                const covered = coverageBySymbol.get(symbol)?.has(sourceId) ?? false;
                return (
                  <td key={symbol} className="py-3 pr-4 text-center">
                    {isLoading ? (
                      <span className="text-stellar-text-secondary">…</span>
                    ) : covered ? (
                      <span className="text-green-400" aria-label={`${symbol} covered by ${SOURCE_LABELS[sourceId]}`}>✓</span>
                    ) : (
                      <span className="text-stellar-text-secondary" aria-label={`${symbol} not covered by ${SOURCE_LABELS[sourceId]}`}>—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
