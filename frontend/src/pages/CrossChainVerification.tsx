import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCrossChainVerifications, triggerCrossChainVerification } from "../services/api";
import type { CrossChainStateResult } from "../types";

const statusColor: Record<string, string> = {
  verified: "border-green-500/40 bg-green-500/10 text-green-300",
  mismatch: "border-red-500/40 bg-red-500/10 text-red-300",
  error: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  stale: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300",
  pending: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

const statusLabel: Record<string, string> = {
  verified: "Verified",
  mismatch: "Mismatch",
  error: "Error",
  stale: "Stale",
  pending: "Pending",
};

function pct(value: number): string {
  return `${value.toFixed(2)}%`;
}

function compact(value: string | number | null | undefined): string {
  if (value == null) return "—";
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return String(value);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 4 }).format(n);
}

function StatusBadge({ status }: { status: string }) {
  const cls = statusColor[status] ?? statusColor.pending;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {statusLabel[status] ?? status}
    </span>
  );
}

function MerkleProofBadge({ valid }: { valid: boolean | null }) {
  if (valid === null) return <span className="text-slate-500 text-sm">—</span>;
  return valid ? (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-300">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
      Valid
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-300">
      <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
      Invalid
    </span>
  );
}

function ProofDepthIndicator({
  depth,
  leafCount,
}: {
  depth: number | null;
  leafCount: number | null;
}) {
  if (depth === null && leafCount === null) return <span className="text-slate-500 text-sm">—</span>;

  const bars = depth ?? 0;
  return (
    <div className="flex items-center gap-1.5" title={`Merkle proof depth: ${depth ?? "?"} levels, ${leafCount ?? "?"} leaves`}>
      {Array.from({ length: Math.min(bars, 8) }).map((_, i) => (
        <span
          key={i}
          className={`h-3 w-1.5 rounded-sm ${
            i < (bars > 4 ? 4 : bars)
              ? "bg-blue-400"
              : "bg-blue-400/40"
          }`}
        />
      ))}
      {bars > 8 && <span className="text-xs text-stellar-text-secondary">+{bars - 8}</span>}
      <span className="text-xs text-stellar-text-secondary ml-1">
        depth {depth ?? "?"}{leafCount !== null ? ` · ${leafCount} leaves` : ""}
      </span>
    </div>
  );
}

function VerificationStatusBadge({ status }: { status: string }) {
  const config: Record<string, { cls: string; label: string; dot: string }> = {
    verified: { cls: "border-green-500/40 bg-green-500/10 text-green-300", label: "Verified", dot: "bg-green-400" },
    challenged: { cls: "border-orange-500/40 bg-orange-500/10 text-orange-300", label: "Challenged", dot: "bg-orange-400 animate-pulse" },
    pending: { cls: "border-slate-500/40 bg-slate-500/10 text-slate-300", label: "Pending", dot: "bg-slate-400" },
    invalid: { cls: "border-red-500/40 bg-red-500/10 text-red-300", label: "Invalid", dot: "bg-red-400" },
    unknown: { cls: "border-gray-500/40 bg-gray-500/10 text-gray-400", label: "Unknown", dot: "bg-gray-500" },
  };
  const { cls, label, dot } = config[status] ?? config.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function BridgeVerificationRow({
  result,
  onVerify,
  verifying,
}: {
  result: CrossChainStateResult;
  onVerify: (bridgeId: string) => void;
  verifying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-stellar-border bg-stellar-surface">
      <button
        className="w-full flex items-start justify-between gap-4 p-4 text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusBadge status={result.status} />
          <div className="min-w-0">
            <p className="font-semibold text-stellar-text-primary truncate">{result.bridgeName}</p>
            <p className="text-xs text-stellar-text-secondary mt-0.5">{result.bridgeId}</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-6 flex-shrink-0 text-sm">
          <div className="text-right">
            <p className="text-stellar-text-secondary text-xs">Source chain</p>
            <p className="text-stellar-text-primary capitalize">{result.sourceChain}</p>
          </div>
          <div className="text-right">
            <p className="text-stellar-text-secondary text-xs">Mismatch</p>
            <p
              className={
                result.mismatchPct > result.mismatchThreshold
                  ? "text-red-400 font-medium"
                  : "text-stellar-text-primary"
              }
            >
              {pct(result.mismatchPct)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-stellar-text-secondary text-xs">Merkle proof</p>
            <MerkleProofBadge valid={result.merkleProofValid} />
          </div>
          <div className="text-right">
            <p className="text-stellar-text-secondary text-xs">Cache</p>
            <p className="text-stellar-text-primary">{result.cacheHit ? "Hit" : "Fresh"}</p>
          </div>
        </div>

        <svg
          className={`w-4 h-4 text-stellar-text-secondary flex-shrink-0 mt-1 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-stellar-border px-4 pb-4 pt-3 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-lg bg-stellar-dark p-3 space-y-2">
              <p className="text-xs font-semibold text-stellar-text-secondary uppercase tracking-wider">
                Stellar State
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-stellar-text-secondary">Asset</span>
                <span className="text-stellar-text-primary font-mono">{result.stellar.assetCode}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stellar-text-secondary">Supply</span>
                <span className="text-stellar-text-primary font-mono">
                  {compact(result.stellar.supply)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-stellar-text-secondary">Issuer</span>
                <span className="text-stellar-text-primary font-mono text-xs truncate max-w-[150px]">
                  {result.stellar.issuer || "—"}
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-stellar-dark p-3 space-y-2">
              <p className="text-xs font-semibold text-stellar-text-secondary uppercase tracking-wider">
                {result.sourceChain.charAt(0).toUpperCase() + result.sourceChain.slice(1)} State
              </p>
              {result.ethereum ? (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-stellar-text-secondary">Locked</span>
                    <span className="text-stellar-text-primary font-mono">
                      {compact(result.ethereum.formattedAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stellar-text-secondary">Block</span>
                    <span className="text-stellar-text-primary font-mono">
                      {result.ethereum.blockNumber.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-stellar-text-secondary">Paused</span>
                    <span
                      className={
                        result.ethereum.isPaused ? "text-red-400 font-medium" : "text-green-400"
                      }
                    >
                      {result.ethereum.isPaused ? "Yes" : "No"}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-stellar-text-secondary text-sm">No EVM data available</p>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-stellar-dark p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-stellar-text-secondary uppercase tracking-wider">
                Reserve Commitment
              </p>
              <VerificationStatusBadge
                status={
                  result.merkleProofValid === null
                    ? "unknown"
                    : result.merkleProofValid
                      ? "verified"
                      : "challenged"
                }
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-stellar-text-secondary text-xs">Sequence</p>
                <p className="text-stellar-text-primary font-mono">
                  {result.latestCommitmentSequence ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-stellar-text-secondary text-xs">Merkle Proof</p>
                <MerkleProofBadge valid={result.merkleProofValid} />
              </div>
              <div>
                <p className="text-stellar-text-secondary text-xs">State Consistent</p>
                <p className={result.stateConsistent ? "text-green-400" : "text-red-400"}>
                  {result.stateConsistent ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-stellar-text-secondary text-xs">Threshold</p>
                <p className="text-stellar-text-primary">{pct(result.mismatchThreshold)}</p>
              </div>
              <div>
                <p className="text-stellar-text-secondary text-xs">Proof Depth</p>
                <ProofDepthIndicator depth={result.proofDepth} leafCount={result.leafCount} />
              </div>
              <div className="sm:col-span-3">
                <p className="text-stellar-text-secondary text-xs">Proof Leaf Hash</p>
                <p className="text-stellar-text-primary font-mono text-xs break-all">
                  {result.proofLeafHash ?? "—"}
                </p>
              </div>
            </div>
          </div>

          {result.error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <span className="font-semibold">Error: </span>
              {result.error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-xs text-stellar-text-secondary">
              Verified {new Date(result.verifiedAt).toLocaleString()} ·{" "}
              {result.cacheHit ? `cached ${result.freshnessSeconds}s ago` : "fresh"}
            </p>
            <button
              onClick={() => onVerify(result.bridgeId)}
              disabled={verifying}
              className="text-sm font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50 transition-colors"
            >
              {verifying ? "Verifying…" : "Re-verify"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CrossChainVerification() {
  const queryClient = useQueryClient();
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["cross-chain-verification"],
    queryFn: () => getCrossChainVerifications(),
    refetchInterval: 60_000,
  });

  const verifyMutation = useMutation({
    mutationFn: (bridgeId: string) => triggerCrossChainVerification(bridgeId),
    onMutate: (bridgeId) => setVerifyingId(bridgeId),
    onSettled: () => {
      setVerifyingId(null);
      queryClient.invalidateQueries({ queryKey: ["cross-chain-verification"] });
    },
  });

  const results: CrossChainStateResult[] = data?.results ?? [];

  const summary = {
    total: data?.count ?? 0,
    verified: data?.verified ?? 0,
    mismatches: data?.mismatches ?? 0,
    errors: data?.errors ?? 0,
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stellar-text-primary">
            Cross-Chain State Verification
          </h1>
          <p className="mt-2 text-stellar-text-secondary">
            Cryptographic proof validation ensuring bridge state authenticity across Ethereum and Stellar
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex-shrink-0 rounded-lg border border-stellar-border bg-stellar-surface px-4 py-2 text-sm font-medium text-stellar-text-primary hover:bg-stellar-border/40 transition-colors"
        >
          Refresh all
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total bridges", value: summary.total, color: "text-stellar-text-primary" },
          { label: "Verified", value: summary.verified, color: "text-green-400" },
          { label: "Mismatches", value: summary.mismatches, color: "text-red-400" },
          { label: "Errors", value: summary.errors, color: "text-orange-400" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border border-stellar-border bg-stellar-surface p-4"
          >
            <p className="text-sm text-stellar-text-secondary">{label}</p>
            <p className={`mt-1 text-3xl font-bold ${color}`}>{isLoading ? "—" : value}</p>
          </div>
        ))}
      </div>

      {isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">
          Failed to load verification results. Check that the backend is reachable.
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-xl border border-stellar-border bg-stellar-surface animate-pulse"
            />
          ))}
        </div>
      )}

      {!isLoading && results.length === 0 && !isError && (
        <div className="rounded-xl border border-stellar-border bg-stellar-surface p-8 text-center text-stellar-text-secondary">
          No active bridge operators found. Configure bridge operators to enable state verification.
        </div>
      )}

      {!isLoading && results.length > 0 && (
        <div className="space-y-3">
          {results.map((result) => (
            <BridgeVerificationRow
              key={result.bridgeId}
              result={result}
              onVerify={(id) => verifyMutation.mutate(id)}
              verifying={verifyingId === result.bridgeId && verifyMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}
