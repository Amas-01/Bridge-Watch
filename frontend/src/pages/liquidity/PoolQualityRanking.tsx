import { Fragment, useCallback, useEffect, useState } from "react";
import { liquidityApi } from "./api";

/**
 * Liquidity Pool Quality Ranking (#1158).
 *
 * The grade alone is not actionable, so each row expands into its component
 * scores — a B caused by thin depth needs a different response from a B caused
 * by a stale snapshot.
 */

interface QualityScore {
  id: string;
  poolKey: string;
  dex: string;
  depthScore: number;
  volumeScore: number;
  feeScore: number;
  stabilityScore: number;
  freshnessScore: number;
  totalScore: number;
  grade: "A" | "B" | "C" | "D" | "F";
  rank: number;
  inputs: Record<string, unknown>;
  computedAt: string;
}

const GRADE_STYLE: Record<QualityScore["grade"], string> = {
  A: "bg-emerald-500/15 text-emerald-300",
  B: "bg-lime-500/15 text-lime-300",
  C: "bg-amber-500/15 text-amber-300",
  D: "bg-orange-500/15 text-orange-300",
  F: "bg-red-500/15 text-red-300",
};

const COMPONENTS: { key: keyof QualityScore; label: string }[] = [
  { key: "depthScore", label: "Depth" },
  { key: "volumeScore", label: "Volume" },
  { key: "stabilityScore", label: "Stability" },
  { key: "feeScore", label: "Fee" },
  { key: "freshnessScore", label: "Freshness" },
];

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-24 rounded bg-slate-800">
      <div
        className="h-1.5 rounded bg-sky-500"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export default function PoolQualityRanking() {
  const [ranking, setRanking] = useState<QualityScore[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [computedAt, setComputedAt] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rankData, weightData] = await Promise.all([
        liquidityApi<{ ranking: QualityScore[]; computedAt: string | null }>(
          "/pool-quality/ranking"
        ),
        liquidityApi<{ weights: Record<string, number> }>("/pool-quality/weights"),
      ]);
      setRanking(rankData.ranking);
      setComputedAt(rankData.computedAt);
      setWeights(weightData.weights);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ranking");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recompute = async () => {
    setLoading(true);
    setError(null);
    try {
      await liquidityApi("/pool-quality/recompute", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Recompute failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Pool Quality Ranking</h1>
          <p className="text-sm text-slate-400">
            {computedAt
              ? `Scored ${new Date(computedAt).toLocaleString()}`
              : "No ranking computed yet"}
          </p>
        </div>
        <button
          onClick={recompute}
          disabled={loading}
          className="rounded bg-sky-600 px-4 py-2 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          {loading ? "Working…" : "Recompute ranking"}
        </button>
      </header>

      {Object.keys(weights).length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs text-slate-400">
          {COMPONENTS.map(({ key, label }) => (
            <span key={key} className="rounded bg-slate-900 px-2 py-1">
              {label} {Math.round((weights[key as string] ?? 0) * 100)}%
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900 text-left text-slate-400">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Pool</th>
              <th className="px-3 py-2">DEX</th>
              <th className="px-3 py-2">Score</th>
              <th className="px-3 py-2">Grade</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {ranking.map((score) => (
              <Fragment key={score.id}>
                <tr className="border-t border-slate-800">
                  <td className="px-3 py-2 text-slate-400">{score.rank}</td>
                  <td className="px-3 py-2 font-mono text-xs">{score.poolKey}</td>
                  <td className="px-3 py-2">{score.dex}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <ScoreBar value={score.totalScore} />
                      <span>{score.totalScore.toFixed(1)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-medium ${GRADE_STYLE[score.grade]}`}
                    >
                      {score.grade}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() =>
                        setExpanded(expanded === score.id ? null : score.id)
                      }
                      className="text-xs text-sky-400 hover:underline"
                    >
                      {expanded === score.id ? "Hide" : "Why?"}
                    </button>
                  </td>
                </tr>
                {expanded === score.id && (
                  <tr className="border-t border-slate-800/50 bg-slate-900/40">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="flex flex-wrap gap-6">
                        {COMPONENTS.map(({ key, label }) => (
                          <div key={key}>
                            <div className="text-xs text-slate-400">{label}</div>
                            <div className="flex items-center gap-2">
                              <ScoreBar value={score[key] as number} />
                              <span className="text-xs">
                                {(score[key] as number).toFixed(1)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <pre className="mt-3 overflow-x-auto rounded bg-slate-950 p-2 text-xs text-slate-400">
                        {JSON.stringify(score.inputs, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {ranking.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No scores yet. Recompute to rank the pools currently tracked.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
