import { useState, type FormEvent } from "react";
import { useLocalStorageState } from "../../hooks/useLocalStorageState";

// =============================================================================
// TYPES
// =============================================================================

type Severity = "low" | "medium" | "high" | "critical";

interface PreviewStep {
  ruleId: string;
  fromSeverity: Severity;
  toSeverity: Severity;
  triggerType: string;
  thresholdDescription: string;
  notificationChannels: string[];
}

interface PolicyPreview {
  assetCode: string;
  alertType: string;
  startingSeverity: Severity;
  activeConditionHistoryId: string | null;
  steps: PreviewStep[];
  projectedFinalSeverity: Severity;
  warnings: string[];
}

const SEVERITY_BADGE: Record<Severity, { bg: string; text: string }> = {
  low: { bg: "bg-stellar-border/40", text: "text-stellar-text-secondary" },
  medium: { bg: "bg-yellow-500/15", text: "text-yellow-300" },
  high: { bg: "bg-orange-500/15", text: "text-orange-300" },
  critical: { bg: "bg-red-500/15", text: "text-red-300" },
};

async function apiFetch<T>(
  path: string,
  apiKey: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      ...((init?.headers as Record<string, string>) ?? {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      msg = body.message ?? body.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json();
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const badge = SEVERITY_BADGE[severity];
  return (
    <span className={`rounded-full px-3 py-1 text-xs capitalize ${badge.bg} ${badge.text}`}>
      {severity}
    </span>
  );
}

// =============================================================================
// COMPONENT
// =============================================================================

export default function AlertEscalationPolicyPreview() {
  const [adminToken, setAdminToken] = useLocalStorageState(
    "bridge-watch:admin-api-key:v1",
    ""
  );

  const [assetCode, setAssetCode] = useState("");
  const [alertType, setAlertType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PolicyPreview | null>(null);

  const handlePreview = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setPreview(null);

    if (!assetCode.trim() || !alertType.trim() || !adminToken) return;

    setLoading(true);
    try {
      const data = await apiFetch<{ preview: PolicyPreview }>(
        `/alert-escalation/preview?assetCode=${encodeURIComponent(assetCode.trim())}&alertType=${encodeURIComponent(alertType.trim())}`,
        adminToken
      );
      setPreview(data.preview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to preview escalation policy");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs uppercase tracking-[0.3em] text-stellar-blue">Alerts</p>
        <h1 className="mt-2 text-3xl font-bold text-white">Alert escalation policy preview</h1>
        <p className="mt-2 max-w-2xl text-stellar-text-secondary">
          See the full escalation chain configured for an asset and alert type —
          every severity step, what triggers it, and who gets notified — without
          recording a real alert occurrence.
        </p>
      </header>

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-white">Admin token</span>
          <input
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="Paste admin API key"
            className="w-full max-w-sm rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
          />
        </label>
      </section>

      <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">Preview a policy</h2>
        <form onSubmit={handlePreview} className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Asset code</span>
            <input
              type="text"
              value={assetCode}
              onChange={(e) => setAssetCode(e.target.value)}
              placeholder="USDC"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-white">Alert type</span>
            <input
              type="text"
              value={alertType}
              onChange={(e) => setAlertType(e.target.value)}
              placeholder="depeg"
              className="w-full rounded-2xl border border-stellar-border bg-stellar-dark px-4 py-3 text-white outline-none transition focus:border-stellar-blue focus:ring-2 focus:ring-stellar-blue"
            />
          </label>
          <button
            type="submit"
            disabled={loading || !adminToken || !assetCode.trim() || !alertType.trim()}
            className="rounded-2xl bg-stellar-blue px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {loading ? "Loading…" : "Preview policy"}
          </button>
        </form>

        {error && <p className="mt-3 text-sm text-red-300" role="alert">{error}</p>}
      </section>

      {preview && (
        <section className="rounded-3xl border border-stellar-border bg-stellar-card/80 p-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-white">
              {preview.assetCode} / {preview.alertType}
            </h2>
            <span className="text-sm text-stellar-text-secondary">Starting at</span>
            <SeverityBadge severity={preview.startingSeverity} />
            <span className="text-sm text-stellar-text-secondary">→ projected</span>
            <SeverityBadge severity={preview.projectedFinalSeverity} />
          </div>

          {preview.warnings.length > 0 && (
            <ul className="mb-4 space-y-1">
              {preview.warnings.map((w, i) => (
                <li key={i} className="text-sm text-yellow-300">
                  {w}
                </li>
              ))}
            </ul>
          )}

          {preview.steps.length === 0 ? (
            <p className="text-sm text-stellar-text-secondary">
              No escalation steps would occur from the current severity.
            </p>
          ) : (
            <ol className="space-y-3">
              {preview.steps.map((step, i) => (
                <li
                  key={step.ruleId}
                  className="rounded-2xl border border-stellar-border bg-stellar-dark/50 p-4"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-stellar-text-secondary">Step {i + 1}</span>
                    <SeverityBadge severity={step.fromSeverity} />
                    <span className="text-stellar-text-secondary">→</span>
                    <SeverityBadge severity={step.toSeverity} />
                  </div>
                  <p className="mt-2 text-sm text-white">{step.thresholdDescription}</p>
                  {step.notificationChannels.length > 0 && (
                    <p className="mt-1 text-xs text-stellar-text-secondary">
                      Notifies: {step.notificationChannels.join(", ")}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
