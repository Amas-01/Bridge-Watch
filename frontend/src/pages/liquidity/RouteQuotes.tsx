import { useCallback, useEffect, useRef, useState } from "react";
import { liquidityApi } from "./api";

/**
 * Route Quote Expiration Handling (#1160).
 *
 * A quote is only good for its TTL, so the page runs a local countdown and
 * flips the quote to expired the moment it lapses — the operator sees the same
 * thing the API would enforce, rather than discovering it on submit.
 */

type QuoteStatus = "active" | "expired" | "consumed" | "superseded";

interface RouteStep {
  poolId: string;
  dexName: string;
  assetIn: string;
  assetOut: string;
  amountIn: number;
  amountOut: number;
  fee: number;
}

interface Quote {
  id: string;
  ownerAddress: string;
  sourceAsset: string;
  targetAsset: string;
  inputAmount: number;
  outputAmount: number | null;
  priceImpactPct: number | null;
  route: RouteStep[] | null;
  ttlSeconds: number;
  status: QuoteStatus;
  quotedAt: string;
  expiresAt: string;
  secondsRemaining: number;
  isExpired: boolean;
}

const STATUS_STYLE: Record<QuoteStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-300",
  expired: "bg-red-500/15 text-red-300",
  consumed: "bg-sky-500/15 text-sky-300",
  superseded: "bg-slate-600/30 text-slate-400",
};

/** Seconds left on a quote, recomputed locally so the countdown is live. */
function useCountdown(expiresAt: string | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  if (!expiresAt) return 0;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

export default function RouteQuotes() {
  const [form, setForm] = useState({
    ownerAddress: "",
    sourceAsset: "USDC",
    targetAsset: "XLM",
    inputAmount: "1000",
    ttlSeconds: "30",
  });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [history, setHistory] = useState<Quote[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ownerRef = useRef("");

  const isLive = quote?.status === "active";
  const secondsLeft = useCountdown(quote?.expiresAt, Boolean(isLive));
  // The server is the authority, but the local countdown is what the operator
  // sees, so treat a lapsed countdown as expired without waiting for a round trip.
  const lapsed = Boolean(isLive) && secondsLeft === 0;

  const loadHistory = useCallback(async (owner: string) => {
    if (!owner) return;
    try {
      const data = await liquidityApi<{ quotes: Quote[] }>(
        `/route-quotes?owner=${encodeURIComponent(owner)}`
      );
      setHistory(data.quotes);
    } catch {
      /* history is supplementary — a failure here should not mask the quote */
    }
  }, []);

  useEffect(() => {
    if (ownerRef.current) void loadHistory(ownerRef.current);
  }, [quote, loadHistory]);

  const requestQuote = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await liquidityApi<{ quote: Quote }>("/route-quotes", {
        method: "POST",
        body: JSON.stringify({
          ownerAddress: form.ownerAddress,
          sourceAsset: form.sourceAsset,
          targetAsset: form.targetAsset,
          inputAmount: Number(form.inputAmount),
          ttlSeconds: Number(form.ttlSeconds),
        }),
      });
      ownerRef.current = form.ownerAddress;
      setQuote(data.quote);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not get a quote");
    } finally {
      setBusy(false);
    }
  };

  const refreshQuote = async () => {
    if (!quote) return;
    setBusy(true);
    setError(null);
    try {
      const data = await liquidityApi<{ quote: Quote }>(
        `/route-quotes/${quote.id}/refresh`,
        { method: "POST" }
      );
      setQuote(data.quote);
      setNotice("Re-priced — the previous quote was superseded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  };

  const consumeQuote = async () => {
    if (!quote) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const data = await liquidityApi<{ quote: Quote }>(
        `/route-quotes/${quote.id}/consume`,
        { method: "POST" }
      );
      setQuote(data.quote);
      setNotice("Quote accepted.");
    } catch (err) {
      // An expired quote is not a dead end: refreshing is the next step.
      setError(
        err instanceof Error
          ? `${err.message} — refresh to re-price at the current reserves.`
          : "Could not accept the quote"
      );
      setQuote({ ...quote, status: "expired", isExpired: true });
    } finally {
      setBusy(false);
    }
  };

  const formValid = form.ownerAddress.trim() !== "" && Number(form.inputAmount) > 0;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Route Quotes</h1>
        <p className="text-sm text-slate-400">
          Quotes are priced against live reserves and lapse when their TTL runs out.
        </p>
      </header>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-end gap-3">
          {(
            [
              ["ownerAddress", "Owner address", "text"],
              ["sourceAsset", "From", "text"],
              ["targetAsset", "To", "text"],
              ["inputAmount", "Amount", "number"],
              ["ttlSeconds", "TTL (s)", "number"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="text-xs text-slate-400">
              {label}
              <input
                type={type}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="mt-1 block rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
              />
            </label>
          ))}
          <button
            onClick={requestQuote}
            disabled={busy || !formValid}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm hover:bg-sky-500 disabled:opacity-50"
          >
            Get quote
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded border border-sky-500/40 bg-sky-500/10 p-3 text-sm text-sky-300">
          {notice}
        </div>
      )}

      {quote && (
        <section className="rounded border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg">
                {quote.inputAmount} {quote.sourceAsset} →{" "}
                <span className="font-medium">
                  {quote.outputAmount ?? "—"} {quote.targetAsset}
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Price impact {quote.priceImpactPct?.toFixed(3) ?? "—"}% ·{" "}
                {quote.route?.length ?? 0} hop(s) · quote{" "}
                <span className="font-mono">{quote.id}</span>
              </div>
            </div>
            <div className="text-right">
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  STATUS_STYLE[lapsed ? "expired" : quote.status]
                }`}
              >
                {lapsed ? "expired" : quote.status}
              </span>
              {isLive && !lapsed && (
                <div className="mt-1 text-2xl font-semibold tabular-nums text-emerald-300">
                  {secondsLeft}s
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={consumeQuote}
              disabled={busy || !isLive || lapsed}
              className="rounded bg-emerald-600 px-3 py-1.5 text-sm hover:bg-emerald-500 disabled:opacity-40"
            >
              Accept quote
            </button>
            <button
              onClick={refreshQuote}
              disabled={busy || quote.status === "consumed"}
              className="rounded border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
            >
              Refresh
            </button>
          </div>

          {quote.route && quote.route.length > 0 && (
            <ol className="mt-4 space-y-1 text-xs text-slate-400">
              {quote.route.map((step, i) => (
                <li key={`${step.poolId}-${i}`}>
                  {i + 1}. {step.dexName}: {step.amountIn} {step.assetIn} →{" "}
                  {step.amountOut} {step.assetOut} (fee {step.fee})
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Quote history</h2>
          <div className="overflow-x-auto rounded border border-slate-800">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900 text-left text-slate-400">
                <tr>
                  <th className="px-3 py-2">Quote</th>
                  <th className="px-3 py-2">Pair</th>
                  <th className="px-3 py-2">In</th>
                  <th className="px-3 py-2">Out</th>
                  <th className="px-3 py-2">TTL</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Quoted</th>
                </tr>
              </thead>
              <tbody>
                {history.map((q) => (
                  <tr key={q.id} className="border-t border-slate-800">
                    <td className="px-3 py-2 font-mono text-xs">{q.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">
                      {q.sourceAsset}/{q.targetAsset}
                    </td>
                    <td className="px-3 py-2">{q.inputAmount}</td>
                    <td className="px-3 py-2">{q.outputAmount ?? "—"}</td>
                    <td className="px-3 py-2">{q.ttlSeconds}s</td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs ${STATUS_STYLE[q.status]}`}>
                        {q.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {new Date(q.quotedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
