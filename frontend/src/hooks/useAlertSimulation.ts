import { useState, useCallback } from "react";

export type SimulationSeverity = "critical" | "high" | "medium" | "low";

export interface SimulationInput {
  severity: SimulationSeverity;
  assetCode: string;
  sourceType: string;
  ownerAddress: string;
  label: string;
  triggeredValue: number | null;
  threshold: number | null;
  metric: string;
}

export interface SimulationRuleResult {
  ruleId: string;
  ruleName: string;
  priorityOrder: number;
  ownerAddress: string | null;
  matched: boolean;
  reasons: string[];
  channels: string[];
  fallbackChannels: string[];
  suppressionWindowSeconds: number;
}

export interface SimulationSummary {
  totalActiveRules: number;
  totalMatched: number;
  firstMatchingRule: { ruleId: string; ruleName: string } | null;
  wouldDispatch: boolean;
  effectiveChannels: string[];
  effectiveFallbackChannels: string[];
  suppressionWindowSeconds: number;
}

export interface SimulationResult {
  simulationId: string;
  timestamp: string;
  input: SimulationInput & {
    ownerAddress: string | null;
    label: string | null;
    triggeredValue: number | null;
    threshold: number | null;
    metric: string | null;
  };
  results: SimulationRuleResult[];
  skippedInactive: { ruleId: string; ruleName: string; priorityOrder: number }[];
  summary: SimulationSummary;
}

const HISTORY_KEY = "bw_sim_history";
const MAX_HISTORY = 20;

function loadHistory(): SimulationResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SimulationResult[]) : [];
  } catch {
    return [];
  }
}

function persistHistory(items: SimulationResult[]): void {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {
    // ignore quota errors
  }
}

export function useAlertSimulation(adminToken: string) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentResult, setCurrentResult] = useState<SimulationResult | null>(null);
  const [history, setHistory] = useState<SimulationResult[]>(loadHistory);

  const runSimulation = useCallback(
    async (input: SimulationInput) => {
      setIsRunning(true);
      setError(null);

      try {
        const payload: Record<string, unknown> = { severity: input.severity };
        if (input.assetCode.trim()) payload.assetCode = input.assetCode.trim();
        if (input.sourceType.trim()) payload.sourceType = input.sourceType.trim();
        if (input.ownerAddress.trim()) payload.ownerAddress = input.ownerAddress.trim();
        if (input.label.trim()) payload.label = input.label.trim();
        if (input.metric.trim()) payload.metric = input.metric.trim();
        if (input.triggeredValue !== null) payload.triggeredValue = input.triggeredValue;
        if (input.threshold !== null) payload.threshold = input.threshold;

        const res = await fetch("/api/v1/admin/alert-routing/simulate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": adminToken,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: unknown };
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : `HTTP ${res.status}`
          );
        }

        const result = (await res.json()) as SimulationResult;
        setCurrentResult(result);
        setHistory((prev) => {
          const next = [result, ...prev].slice(0, MAX_HISTORY);
          persistHistory(next);
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Simulation failed");
      } finally {
        setIsRunning(false);
      }
    },
    [adminToken]
  );

  const restoreFromHistory = useCallback((result: SimulationResult) => {
    setCurrentResult(result);
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    persistHistory([]);
  }, []);

  return {
    isRunning,
    error,
    currentResult,
    history,
    runSimulation,
    restoreFromHistory,
    clearHistory,
  };
}
