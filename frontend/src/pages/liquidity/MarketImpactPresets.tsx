import { useCallback, useEffect, useState } from "react";
import { liquidityApi, pct, usd } from "./api";

/**
 * Market Impact Scenario Presets (#1159).
 *
 * Pick a saved trade size, apply it across pools, and see which pools cannot
 * absorb it within the preset's slippage tolerance.
 */

interface Preset {
  id: string;
  name: string;
  description: string | null;
  tradeSizeUsd: number;
  slippageTolerancePct: number;
  isSystem: boolean;
}

interface Scenario {
  poolKey: string;
  dex: string;
  pair: string;
  poolLiquidityUsd: number;
  tradeSharePct: number;
  priceImpactPct: number;
  effectiveSlippagePct: number;
  estimatedCostUsd: number;
  withinTolerance: boolean;
  severity: "low" | "moderate" | "high" | "severe";
}

const SEVERITY_STYLE: Record<Scenario["severity"], string> = {
  low: "bg-emerald-500/15 text-emerald-300",
  moderate: "bg-amber-500/15 text-amber-300",
  high: "bg-orange-500/15 text-orange-300",
  severe: "bg-red-500/15 text-red-300",
};

const EMPTY_DRAFT = { name: "", tradeSizeUsd: "", slippageTolerancePct: "" };

export default function MarketImpactPresets() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [breachCount, setBreachCount] = useState(0);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPresets = useCallback(async () => {
    setError(null);
    try {
      const data = await liquidityApi<{ presets: Preset[] }>("/market-impact-presets");
      setPresets(data.presets);
      setSelected((current) => current ?? data.presets[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load presets");
    }
  }, []);

  useEffect(() => {
    void loadPresets();
  }, [loadPresets]);

  const apply = async (presetId: string) => {
    setSelected(presetId);
    setLoading(true);
    setError(null);
    try {
      const data = await liquidityApi<{ scenarios: Scenario[]; breachCount: number }>(
        `/market-impact-presets/${presetId}/apply`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setScenarios(data.scenarios);
      setBreachCount(data.breachCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scenario failed");
    } finally {
      setLoading(false);
    }
  };

  const createPreset = async () => {
    setError(null);
    try {
      await liquidityApi("/market-impact-presets", {
        method: "POST",
        body: JSON.stringify({
          name: draft.name,
          tradeSizeUsd: Number(draft.tradeSizeUsd),
          slippageTolerancePct: Number(draft.slippageTolerancePct),
        }),
      });
      setDraft(EMPTY_DRAFT);
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create preset");
    }
  };

  const deletePreset = async (id: string) => {
    setError(null);
    try {
      await liquidityApi(`/market-impact-presets/${id}`, { method: "DELETE" });
      if (selected === id) {
        setSelected(null);
        setScenarios([]);
      }
      await loadPresets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete preset");
    }
  };

  const draftValid =
    draft.name.trim() !== "" &&
    Number(draft.tradeSizeUsd) > 0 &&
    Number(draft.slippageTolerancePct) > 0;

  return (
    <div className="p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Market Impact Presets</h1>
        <p className="text-sm text-slate-400">
          Apply a saved trade size across every tracked pool.
        </p>
      </header>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="flex flex-wrap gap-3">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className={`rounded border p-3 text-sm ${
              selected === preset.id
                ? "border-sky-500 bg-sky-500/10"
                : "border-slate-800 bg-slate-900"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {preset.name}
              {preset.isSystem && (
                <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] text-slate-300">
                  system
                </span>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {usd(preset.tradeSizeUsd)} · tolerance {pct(preset.slippageTolerancePct, 1)}
            </div>
            <div className="mt-2 flex gap-3 text-xs">
              <button
                onClick={() => apply(preset.id)}
                className="text-sky-400 hover:underline"
              >
                Apply
              </button>
              {!preset.isSystem && (
                <button
                  onClick={() => deletePreset(preset.id)}
                  className="text-red-400 hover:underline"
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="rounded border border-slate-800 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-medium text-slate-300">New preset</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-400">
            Name
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="mt-1 block rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Trade size (USD)
            <input
              type="number"
              min="1"
              value={draft.tradeSizeUsd}
              onChange={(e) => setDraft({ ...draft, tradeSizeUsd: e.target.value })}
              className="mt-1 block rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs text-slate-400">
            Slippage tolerance (%)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={draft.slippageTolerancePct}
              onChange={(e) =>
                setDraft({ ...draft, slippageTolerancePct: e.target.value })
              }
              className="mt-1 block rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            />
          </label>
          <button
            onClick={createPreset}
            disabled={!draftValid}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm hover:bg-sky-500 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium">
          Scenario results
          {scenarios.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-400">
              {breachCount} of {scenarios.length} pools breach tolerance
            </span>
          )}
        </h2>
        <div className="overflow-x-auto rounded border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-900 text-left text-slate-400">
              <tr>
                <th className="px-3 py-2">Pool</th>
                <th className="px-3 py-2">Pair</th>
                <th className="px-3 py-2">Depth</th>
                <th className="px-3 py-2">Trade share</th>
                <th className="px-3 py-2">Price impact</th>
                <th className="px-3 py-2">Effective slippage</th>
                <th className="px-3 py-2">Cost</th>
                <th className="px-3 py-2">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((s) => (
                <tr key={s.poolKey} className="border-t border-slate-800">
                  <td className="px-3 py-2 font-mono text-xs">{s.poolKey}</td>
                  <td className="px-3 py-2">{s.pair}</td>
                  <td className="px-3 py-2">{usd(s.poolLiquidityUsd)}</td>
                  <td className="px-3 py-2">{pct(s.tradeSharePct, 1)}</td>
                  <td className="px-3 py-2">{pct(s.priceImpactPct)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs ${SEVERITY_STYLE[s.severity]}`}>
                      {pct(s.effectiveSlippagePct)}
                    </span>
                  </td>
                  <td className="px-3 py-2">{usd(s.estimatedCostUsd)}</td>
                  <td className="px-3 py-2">
                    {s.withinTolerance ? (
                      <span className="text-emerald-300">within tolerance</span>
                    ) : (
                      <span className="text-red-300">breaches tolerance</span>
                    )}
                  </td>
                </tr>
              ))}
              {scenarios.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                    Apply a preset to see how each pool absorbs the trade.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
