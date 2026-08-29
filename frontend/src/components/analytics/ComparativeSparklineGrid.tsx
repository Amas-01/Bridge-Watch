import { Link } from "react-router-dom";
import Sparkline from "../Sparkline";

export type ComparativeSparklineItem = {
  symbol: string;
  name: string;
  period?: "24h" | "7d" | "30d";
};

type ComparativeSparklineGridProps = {
  items: ComparativeSparklineItem[];
};

export default function ComparativeSparklineGrid({ items }: ComparativeSparklineGridProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-stellar-border bg-stellar-card p-6">
        <h2 className="text-lg font-semibold text-white">Comparative sparklines</h2>
        <p className="mt-2 text-sm text-stellar-text-secondary">
          No assets available for comparison yet.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-stellar-border bg-gradient-to-br from-stellar-card to-stellar-dark/35 p-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Comparative sparklines</h2>
          <p className="mt-1 text-sm text-stellar-text-secondary">
            Compare short-term health trends across the most monitored assets.
          </p>
        </div>
        <p className="text-xs uppercase tracking-[0.24em] text-stellar-text-secondary">
          Touch-friendly grid
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <article
            key={item.symbol}
            className="rounded-xl border border-stellar-border/80 bg-stellar-dark/30 p-4 transition-colors hover:border-stellar-blue/60"
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-white">
                  <Link to={`/assets/${item.symbol}`} className="hover:text-stellar-blue">
                    {item.symbol}
                  </Link>
                </h3>
                <p className="text-xs text-stellar-text-secondary">{item.name}</p>
              </div>
              <span className="rounded-full border border-stellar-border px-2 py-1 text-[11px] uppercase tracking-wider text-stellar-text-secondary">
                {item.period ?? "7d"}
              </span>
            </div>

            <Sparkline
              symbol={item.symbol}
              metric="health"
              period={item.period ?? "7d"}
              height={48}
              showMinMax={false}
              aria-label={`${item.symbol} comparative health sparkline`}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

