import { useQuery } from "@tanstack/react-query";
import { getCircuitState } from "../services/api";

interface BridgePauseReasonPanelProps {
  bridgeName: string;
}

const LEVEL_LABELS: Record<string, string> = {
  none: "None",
  warning: "Warning",
  partial: "Partial",
  full: "Full",
};

function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString();
}

export default function BridgePauseReasonPanel({ bridgeName }: BridgePauseReasonPanelProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["circuit-state", "bridge", bridgeName],
    queryFn: () => getCircuitState("bridge", bridgeName),
    enabled: !!bridgeName,
    refetchInterval: 30_000,
  });

  if (isLoading || !data?.isPaused) {
    return null;
  }

  return (
    <section
      aria-labelledby="bridge-pause-reason-heading"
      className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-6 space-y-2"
    >
      <h2 id="bridge-pause-reason-heading" className="text-lg font-semibold text-white">
        Bridge Paused
      </h2>
      <p className="text-sm text-stellar-text-secondary">
        <span className="font-medium text-yellow-400">
          {LEVEL_LABELS[data.level] ?? data.level}
        </span>
        {data.triggerReason ? `: ${data.triggerReason}` : " — no reason recorded"}
      </p>
      <div className="flex flex-wrap gap-4 text-xs text-stellar-text-secondary">
        {data.triggeredBy && <span>Triggered by {data.triggeredBy}</span>}
        {data.timestamp != null && <span>Since {formatTimestamp(data.timestamp)}</span>}
        {data.recoveryDeadline != null && (
          <span>Recovery deadline {formatTimestamp(data.recoveryDeadline)}</span>
        )}
      </div>
    </section>
  );
}
