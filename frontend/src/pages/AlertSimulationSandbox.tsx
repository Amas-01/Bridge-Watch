import { useState } from "react";
import {
  useAlertSimulation,
  type SimulationInput,
  type SimulationResult,
  type SimulationSeverity,
} from "../hooks/useAlertSimulation";

// ─── Constants ───────────────────────────────────────────────────────────────

const SEVERITY_STYLES: Record<SimulationSeverity, { badge: string; dot: string }> = {
  critical: { badge: "bg-red-900/50 text-red-400 border border-red-700", dot: "bg-red-500" },
  high: { badge: "bg-orange-900/50 text-orange-400 border border-orange-700", dot: "bg-orange-500" },
  medium: { badge: "bg-yellow-900/50 text-yellow-400 border border-yellow-700", dot: "bg-yellow-500" },
  low: { badge: "bg-blue-900/50 text-blue-400 border border-blue-700", dot: "bg-blue-500" },
};

const CHANNEL_LABELS: Record<string, string> = {
  in_app: "In-App",
  webhook: "Webhook",
  email: "Email",
};

const PRESETS = [
  {
    id: "critical_bridge",
    label: "Critical Bridge Failure",
    description: "Complete bridge outage, funds at risk",
    input: {
      severity: "critical" as SimulationSeverity,
      assetCode: "USDC",
      sourceType: "bridge",
      metric: "bridge_health",
      triggeredValue: 0,
      threshold: 100,
    },
  },
  {
    id: "token_exploit",
    label: "Token Exploit",
    description: "Security vulnerability detected",
    input: {
      severity: "critical" as SimulationSeverity,
      assetCode: "ETH",
      sourceType: "security",
      metric: "exploit_severity",
      triggeredValue: 1,
      threshold: 0,
    },
  },
  {
    id: "tvl_anomaly",
    label: "TVL Anomaly",
    description: "Significant total value locked drop",
    input: {
      severity: "high" as SimulationSeverity,
      assetCode: "WBTC",
      sourceType: "analytics",
      metric: "tvl_usd",
      triggeredValue: 8500000,
      threshold: 10000000,
    },
  },
  {
    id: "reserve_drift",
    label: "Reserve Backing Drift",
    description: "Collateral ratio below threshold",
    input: {
      severity: "high" as SimulationSeverity,
      assetCode: "USDT",
      sourceType: "reconciliation",
      metric: "backing_ratio",
      triggeredValue: 0.94,
      threshold: 0.98,
    },
  },
  {
    id: "gas_spike",
    label: "Gas Price Spike",
    description: "Network fees impacting operations",
    input: {
      severity: "medium" as SimulationSeverity,
      assetCode: "",
      sourceType: "network",
      metric: "gas_gwei",
      triggeredValue: 250,
      threshold: 100,
    },
  },
  {
    id: "maintenance",
    label: "Scheduled Maintenance",
    description: "Low-priority maintenance window",
    input: {
      severity: "low" as SimulationSeverity,
      assetCode: "",
      sourceType: "maintenance",
      metric: "maintenance_flag",
      triggeredValue: 1,
      threshold: 0,
    },
  },
] as const;

const ADMIN_TOKEN_KEY = "bw_admin_token";

function loadToken(): string {
  try {
    return localStorage.getItem(ADMIN_TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

const DEFAULT_INPUT: SimulationInput = {
  severity: "high",
  assetCode: "",
  sourceType: "",
  ownerAddress: "",
  label: "",
  triggeredValue: null,
  threshold: null,
  metric: "",
};

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AlertSimulationSandbox() {
  const [adminToken, setAdminToken] = useState(loadToken);
  const [input, setInput] = useState<SimulationInput>(DEFAULT_INPUT);
  const [activeTab, setActiveTab] = useState<"results" | "history">("results");

  const { isRunning, error, currentResult, history, runSimulation, restoreFromHistory, clearHistory } =
    useAlertSimulation(adminToken);

  function applyPreset(preset: (typeof PRESETS)[number]) {
    setInput({
      ...DEFAULT_INPUT,
      severity: preset.input.severity,
      assetCode: preset.input.assetCode,
      sourceType: preset.input.sourceType,
      metric: preset.input.metric,
      triggeredValue: preset.input.triggeredValue,
      threshold: preset.input.threshold,
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void runSimulation(input);
  }

  const inputCls =
    "bg-stellar-card border border-stellar-border rounded px-3 py-2 text-sm text-white placeholder-stellar-text-muted focus:outline-none focus:border-stellar-blue w-full";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-stellar-text-primary">
            Alert Simulation Sandbox
          </h1>
          <p className="mt-2 text-stellar-text-secondary">
            Dry-run alert rules against synthetic data before enabling in production. No alerts are dispatched.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-900/30 border border-amber-600/40 text-amber-400 text-xs font-medium">
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          Simulation only — no real dispatches
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* ── Left: configuration panel ──────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Admin token */}
          <div className="bg-stellar-card border border-stellar-border rounded-lg p-4">
            <label
              htmlFor="sim-admin-token"
              className="block text-xs font-semibold uppercase tracking-wider text-stellar-text-muted mb-2"
            >
              Admin API Token
            </label>
            <input
              id="sim-admin-token"
              type="password"
              value={adminToken}
              onChange={(e) => {
                setAdminToken(e.target.value);
                try {
                  localStorage.setItem(ADMIN_TOKEN_KEY, e.target.value);
                } catch {
                  // ignore
                }
              }}
              placeholder="Enter admin API key"
              className={inputCls}
              autoComplete="current-password"
            />
          </div>

          {/* Scenario presets */}
          <div className="bg-stellar-card border border-stellar-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Scenario Presets</h3>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="text-left p-2.5 rounded-md border border-stellar-border/70 bg-stellar-dark/30 hover:border-stellar-blue hover:bg-stellar-blue/5 transition-colors"
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEVERITY_STYLES[preset.input.severity].dot}`}
                    />
                    <span className="text-xs font-medium text-white truncate">{preset.label}</span>
                  </div>
                  <p className="text-xs text-stellar-text-muted truncate">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Input form */}
          <form
            onSubmit={handleSubmit}
            className="bg-stellar-card border border-stellar-border rounded-lg p-4 space-y-4"
          >
            <h3 className="text-sm font-semibold text-white">Alert Parameters</h3>

            {/* Severity selector */}
            <fieldset>
              <legend className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5">
                Severity <span className="text-red-400" aria-hidden="true">*</span>
              </legend>
              <div className="grid grid-cols-4 gap-1" role="group" aria-label="Select severity">
                {(["critical", "high", "medium", "low"] as SimulationSeverity[]).map((sev) => (
                  <button
                    key={sev}
                    type="button"
                    onClick={() => setInput((p) => ({ ...p, severity: sev }))}
                    aria-pressed={input.severity === sev}
                    className={`py-1.5 rounded text-xs font-semibold uppercase transition-colors ${
                      input.severity === sev
                        ? SEVERITY_STYLES[sev].badge
                        : "bg-stellar-dark/30 text-stellar-text-muted border border-stellar-border/50 hover:text-stellar-text-secondary"
                    }`}
                  >
                    {sev}
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Asset code */}
            <div>
              <label
                htmlFor="sim-asset"
                className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
              >
                Asset Code
              </label>
              <input
                id="sim-asset"
                type="text"
                value={input.assetCode}
                onChange={(e) =>
                  setInput((p) => ({ ...p, assetCode: e.target.value.toUpperCase() }))
                }
                placeholder="e.g. USDC, ETH, WBTC"
                className={inputCls}
              />
            </div>

            {/* Source type */}
            <div>
              <label
                htmlFor="sim-source"
                className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
              >
                Source Type
              </label>
              <input
                id="sim-source"
                type="text"
                value={input.sourceType}
                onChange={(e) => setInput((p) => ({ ...p, sourceType: e.target.value }))}
                placeholder="e.g. bridge, security, analytics"
                className={inputCls}
              />
            </div>

            {/* Triggered value / threshold */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="sim-triggered"
                  className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
                >
                  Triggered Value
                </label>
                <input
                  id="sim-triggered"
                  type="number"
                  value={input.triggeredValue ?? ""}
                  onChange={(e) =>
                    setInput((p) => ({
                      ...p,
                      triggeredValue: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <label
                  htmlFor="sim-threshold"
                  className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
                >
                  Threshold
                </label>
                <input
                  id="sim-threshold"
                  type="number"
                  value={input.threshold ?? ""}
                  onChange={(e) =>
                    setInput((p) => ({
                      ...p,
                      threshold: e.target.value === "" ? null : Number(e.target.value),
                    }))
                  }
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Metric */}
            <div>
              <label
                htmlFor="sim-metric"
                className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
              >
                Metric
              </label>
              <input
                id="sim-metric"
                type="text"
                value={input.metric}
                onChange={(e) => setInput((p) => ({ ...p, metric: e.target.value }))}
                placeholder="e.g. bridge_health, backing_ratio"
                className={inputCls}
              />
            </div>

            {/* Owner address */}
            <div>
              <label
                htmlFor="sim-owner"
                className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
              >
                Owner Address <span className="text-stellar-text-muted/60 normal-case font-normal">(optional)</span>
              </label>
              <input
                id="sim-owner"
                type="text"
                value={input.ownerAddress}
                onChange={(e) => setInput((p) => ({ ...p, ownerAddress: e.target.value }))}
                placeholder="Filter rules by owner"
                className={inputCls}
              />
            </div>

            {/* Run label */}
            <div>
              <label
                htmlFor="sim-label"
                className="block text-xs font-semibold text-stellar-text-muted uppercase tracking-wider mb-1.5"
              >
                Run Label <span className="text-stellar-text-muted/60 normal-case font-normal">(optional)</span>
              </label>
              <input
                id="sim-label"
                type="text"
                value={input.label}
                onChange={(e) => setInput((p) => ({ ...p, label: e.target.value }))}
                placeholder="e.g. Pre-launch validation"
                maxLength={120}
                className={inputCls}
              />
            </div>

            <button
              type="submit"
              disabled={isRunning || !adminToken.trim()}
              className="w-full py-2.5 px-4 rounded-md bg-stellar-blue text-white text-sm font-semibold hover:bg-stellar-blue/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isRunning ? (
                <>
                  <svg
                    className="w-4 h-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 3v3M12 18v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M3 12H6M18 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
                    />
                  </svg>
                  Running simulation…
                </>
              ) : (
                "Run Simulation"
              )}
            </button>

            {!adminToken.trim() && (
              <p className="text-xs text-amber-400 text-center" role="alert">
                Admin API token required to run simulations
              </p>
            )}
          </form>
        </div>

        {/* ── Right: results / history ───────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-stellar-border">
            {(["results", "history"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab
                    ? "text-white border-stellar-blue"
                    : "text-stellar-text-muted border-transparent hover:text-stellar-text-secondary"
                }`}
                aria-selected={activeTab === tab}
                role="tab"
              >
                {tab === "results" ? "Results" : `History (${history.length})`}
              </button>
            ))}
          </div>

          {/* Results tab */}
          {activeTab === "results" && (
            <div>
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-red-400"
                >
                  {error}
                </div>
              )}

              {!currentResult && !isRunning && !error && (
                <div className="rounded-lg border border-stellar-border bg-stellar-card/50 p-12 text-center">
                  <svg
                    className="w-12 h-12 mx-auto mb-4 text-stellar-text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
                    />
                  </svg>
                  <p className="text-stellar-text-secondary font-medium">No simulation run yet</p>
                  <p className="text-sm text-stellar-text-muted mt-1">
                    Choose a preset or configure parameters, then click Run Simulation.
                  </p>
                </div>
              )}

              {isRunning && (
                <div className="rounded-lg border border-stellar-border bg-stellar-card/50 p-12 text-center">
                  <svg
                    className="w-10 h-10 mx-auto mb-4 text-stellar-blue animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-label="Running simulation"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 3v3M12 18v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M3 12H6M18 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
                    />
                  </svg>
                  <p className="text-stellar-text-secondary">Evaluating routing rules…</p>
                </div>
              )}

              {currentResult && !isRunning && (
                <SimulationResults result={currentResult} />
              )}
            </div>
          )}

          {/* History tab */}
          {activeTab === "history" && (
            <SimulationHistory
              history={history}
              onRestore={(r) => {
                restoreFromHistory(r);
                setActiveTab("results");
              }}
              onClear={clearHistory}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SimulationResults({ result }: { result: SimulationResult }) {
  const { summary, input, results, skippedInactive } = result;
  const [showSkipped, setShowSkipped] = useState(false);

  return (
    <div className="space-y-4" aria-label="Simulation results">
      {/* Run metadata */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stellar-text-muted">
        <span className="font-mono text-stellar-text-secondary">{result.simulationId}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={result.timestamp}>{new Date(result.timestamp).toLocaleString()}</time>
        {input.label && (
          <>
            <span aria-hidden="true">·</span>
            <span className="text-stellar-text-primary">"{input.label}"</span>
          </>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div
          className={`rounded-lg border p-3 text-center ${
            summary.wouldDispatch
              ? "border-green-700 bg-green-900/20"
              : "border-stellar-border bg-stellar-card"
          }`}
        >
          <p
            className={`text-xl font-bold ${
              summary.wouldDispatch ? "text-green-400" : "text-stellar-text-muted"
            }`}
          >
            {summary.wouldDispatch ? "FIRES" : "SILENT"}
          </p>
          <p className="text-xs text-stellar-text-muted mt-0.5">Would dispatch</p>
        </div>
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-3 text-center">
          <p className="text-xl font-bold text-white">{summary.totalMatched}</p>
          <p className="text-xs text-stellar-text-muted mt-0.5">Rules matched</p>
        </div>
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-3 text-center">
          <p className="text-xl font-bold text-white">{summary.totalActiveRules}</p>
          <p className="text-xs text-stellar-text-muted mt-0.5">Rules checked</p>
        </div>
      </div>

      {/* Simulated input echo */}
      <div className="rounded-lg border border-stellar-border bg-stellar-dark/30 px-4 py-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-stellar-text-muted">Severity:</span>
        <span className={`font-semibold uppercase px-1.5 py-0.5 rounded ${SEVERITY_STYLES[input.severity as SimulationSeverity]?.badge ?? ""}`}>
          {input.severity}
        </span>
        {input.assetCode && (
          <>
            <span className="text-stellar-text-muted">Asset:</span>
            <span className="text-stellar-text-primary">{input.assetCode}</span>
          </>
        )}
        {input.sourceType && (
          <>
            <span className="text-stellar-text-muted">Source:</span>
            <span className="text-stellar-text-primary">{input.sourceType}</span>
          </>
        )}
        {input.metric && (
          <>
            <span className="text-stellar-text-muted">Metric:</span>
            <span className="text-stellar-text-primary">{input.metric}</span>
          </>
        )}
        {input.triggeredValue !== null && (
          <>
            <span className="text-stellar-text-muted">Value:</span>
            <span className="text-stellar-text-primary">
              {input.triggeredValue}
              {input.threshold !== null && ` / ${input.threshold}`}
            </span>
          </>
        )}
      </div>

      {/* Effective channels */}
      {summary.wouldDispatch && (
        <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stellar-text-muted mb-2">
            Effective Channels
            {summary.firstMatchingRule && (
              <span className="ml-2 normal-case font-normal text-stellar-text-secondary">
                via "{summary.firstMatchingRule.ruleName}"
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {summary.effectiveChannels.map((ch) => (
              <span
                key={ch}
                className="px-2.5 py-1 rounded-full border border-stellar-blue/50 bg-stellar-blue/10 text-stellar-blue text-xs font-medium"
              >
                {CHANNEL_LABELS[ch] ?? ch}
              </span>
            ))}
            {summary.effectiveFallbackChannels.length > 0 && (
              <span className="text-xs text-stellar-text-muted self-center">
                · Fallback:{" "}
                {summary.effectiveFallbackChannels
                  .map((ch) => CHANNEL_LABELS[ch] ?? ch)
                  .join(", ")}
              </span>
            )}
          </div>
          {summary.suppressionWindowSeconds > 0 && (
            <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Suppression window: {summary.suppressionWindowSeconds}s — rapid repeats may be suppressed in production
            </p>
          )}
        </div>
      )}

      {/* Per-rule breakdown */}
      <div>
        <h4 className="text-sm font-semibold text-white mb-2">
          Rule Evaluation ({results.length} active)
        </h4>
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.ruleId}
              className={`rounded-lg border p-3 transition-opacity ${
                r.matched
                  ? "border-green-700/60 bg-green-900/10"
                  : "border-stellar-border/40 bg-stellar-card/30 opacity-60"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {r.matched ? (
                    <svg className="w-4 h-4 text-green-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-label="Matched">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-stellar-text-muted flex-shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-label="No match">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span
                    className={`text-sm font-medium truncate ${
                      r.matched ? "text-white" : "text-stellar-text-secondary"
                    }`}
                  >
                    {r.ruleName}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-stellar-text-muted">P{r.priorityOrder}</span>
                  {r.matched && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-green-900/40 text-green-400 border border-green-700/50">
                      MATCH
                    </span>
                  )}
                </div>
              </div>

              <ul className="space-y-0.5" aria-label="Match reasons">
                {r.reasons.map((reason, i) => (
                  <li key={i} className="text-xs text-stellar-text-muted flex items-start gap-1.5">
                    <span className="text-stellar-text-muted/40 flex-shrink-0" aria-hidden="true">•</span>
                    {reason}
                  </li>
                ))}
              </ul>

              {r.matched && r.channels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-stellar-border/30">
                  {r.channels.map((ch) => (
                    <span
                      key={ch}
                      className="text-xs px-1.5 py-0.5 rounded border border-stellar-blue/40 text-stellar-blue bg-stellar-blue/5"
                    >
                      {CHANNEL_LABELS[ch] ?? ch}
                    </span>
                  ))}
                  {r.suppressionWindowSeconds > 0 && (
                    <span className="text-xs text-amber-400 self-center ml-1">
                      {r.suppressionWindowSeconds}s suppression
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {results.length === 0 && (
            <div className="rounded-lg border border-stellar-border p-6 text-center text-sm text-stellar-text-secondary">
              No active routing rules found for this owner.
            </div>
          )}
        </div>

        {skippedInactive.length > 0 && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowSkipped((s) => !s)}
              className="text-xs text-stellar-text-muted hover:text-stellar-text-secondary transition-colors flex items-center gap-1"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showSkipped ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 12 12"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5L6 7.5 9 4.5" />
              </svg>
              {skippedInactive.length} inactive rule{skippedInactive.length !== 1 ? "s" : ""} skipped
            </button>
            {showSkipped && (
              <ul className="mt-2 space-y-1 pl-4">
                {skippedInactive.map((r) => (
                  <li key={r.ruleId} className="text-xs text-stellar-text-muted">
                    P{r.priorityOrder} — {r.ruleName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SimulationHistory({
  history,
  onRestore,
  onClear,
}: {
  history: SimulationResult[];
  onRestore: (r: SimulationResult) => void;
  onClear: () => void;
}) {
  if (history.length === 0) {
    return (
      <div className="rounded-lg border border-stellar-border bg-stellar-card/50 p-8 text-center">
        <p className="text-stellar-text-secondary text-sm">No simulation runs recorded yet.</p>
        <p className="text-xs text-stellar-text-muted mt-1">Runs are saved locally in your browser.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-stellar-text-muted">
          {history.length} run{history.length !== 1 ? "s" : ""} — stored locally
        </p>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          Clear all
        </button>
      </div>

      <div className="space-y-2" role="list" aria-label="Simulation history">
        {history.map((run) => (
          <button
            key={run.simulationId}
            type="button"
            role="listitem"
            onClick={() => onRestore(run)}
            className="w-full text-left rounded-lg border border-stellar-border bg-stellar-card/50 hover:bg-stellar-card-hover hover:border-stellar-blue/40 p-3 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${
                      SEVERITY_STYLES[run.input.severity as SimulationSeverity]?.badge ?? ""
                    }`}
                  >
                    {run.input.severity}
                  </span>
                  {run.input.label && (
                    <span className="text-xs text-white truncate">"{run.input.label}"</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-stellar-text-muted">
                  {run.input.assetCode && <span>{run.input.assetCode}</span>}
                  {run.input.assetCode && run.input.sourceType && (
                    <span aria-hidden="true">·</span>
                  )}
                  {run.input.sourceType && <span>{run.input.sourceType}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <span
                  className={`text-xs font-medium ${
                    run.summary.wouldDispatch ? "text-green-400" : "text-stellar-text-muted"
                  }`}
                >
                  {run.summary.wouldDispatch ? "Fires" : "Silent"}
                </span>
                <p className="text-xs text-stellar-text-muted">
                  {run.summary.totalMatched}/{run.summary.totalActiveRules} matched
                </p>
              </div>
            </div>
            <time
              dateTime={run.timestamp}
              className="block text-xs text-stellar-text-muted mt-1.5"
            >
              {new Date(run.timestamp).toLocaleString()}
            </time>
          </button>
        ))}
      </div>
    </div>
  );
}
