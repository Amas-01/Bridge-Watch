import crypto from "node:crypto";
import { SUPPORTED_ASSETS } from "../config/index.js";
import {
  AnomalyModel,
  type AnomalyEventRecord,
  type AnomalySeverity,
  type AnomalyThresholdRecord,
  type AnomalyTuningOverrideRecord,
  type AnomalyTuningProfileRecord,
  type AnomalyType,
} from "../database/models/anomaly.model.js";
import { logger } from "../utils/logger.js";
import { BridgeService, type BridgeStatus } from "./bridge.service.js";
import { HealthService, type HealthScore } from "./health.service.js";
import { LiquidityService, type AggregatedLiquidity } from "./liquidity.service.js";
import { PriceService, type AggregatedPrice } from "./price.service.js";

type SignalType = "price" | "liquidity" | "supply" | "bridge_health" | "health_score";

export interface DetectionSignal {
  type: SignalType;
  direction: "spike" | "drop" | "divergence" | "degraded";
  metric: string;
  current: number | string;
  previous?: number | string | null;
  threshold: number | string;
  delta?: number | null;
}

export interface DetectionExplanation {
  summary: string;
  rules: string[];
  evidence: DetectionSignal[];
}

export interface DetectionSnapshot {
  assetCode: string;
  price?: AggregatedPrice | null;
  liquidity?: AggregatedLiquidity | null;
  health?: HealthScore | null;
  bridge?: BridgeStatus | null;
}

export interface AnomalyDetectionResult {
  assetCode: string;
  bridgeName: string | null;
  anomaly: boolean;
  event?: AnomalyEventRecord;
  signals: DetectionSignal[];
  explanation: DetectionExplanation;
  suppressed?: boolean;
}

interface PreviousSnapshot {
  price?: number;
  liquidity?: number;
  healthScore?: number;
}

export interface BaselineDeviation {
  mean: number;
  standardDeviation: number;
  score: number;
}

export function calculateBaselineDeviation(values: number[], current: number): BaselineDeviation | null {
  if (values.length < 3) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const standardDeviation = Math.sqrt(variance);
  if (standardDeviation === 0) return null;
  return { mean, standardDeviation, score: (current - mean) / standardDeviation };
}

const SEVERITY_WEIGHT: Record<AnomalySeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export class AnomalyDetectionService {
  private model = new AnomalyModel();
  private priceService = new PriceService();
  private liquidityService = new LiquidityService();
  private healthService = new HealthService();
  private bridgeService = new BridgeService();
  private snapshotHistory = new Map<string, PreviousSnapshot[]>();

  async evaluateAllAssets(): Promise<AnomalyDetectionResult[]> {
    const bridgeStatuses = await this.bridgeService.getAllBridgeStatuses();
    const results: AnomalyDetectionResult[] = [];

    for (const asset of SUPPORTED_ASSETS) {
      const bridge = this.findBridgeForAsset(bridgeStatuses.bridges, asset.code);
      const result = await this.evaluateAsset(asset.code, bridge?.name);
      results.push(result);
    }

    return results;
  }

  async evaluateAsset(assetCode: string, bridgeName?: string): Promise<AnomalyDetectionResult> {
    const normalizedAsset = assetCode.toUpperCase();
    const snapshot = await this.collectSnapshot(normalizedAsset, bridgeName);
    const [thresholds, tuning] = await Promise.all([
      this.model.getActiveThresholds(),
      this.model.getActiveTuningProfile(),
    ]);
    const threshold = this.resolveThreshold(thresholds, normalizedAsset, snapshot.bridge?.name ?? bridgeName ?? "*");
    const signals = this.detectSignals(snapshot, threshold, tuning);
    const type = this.resolveType(signals);
    const severity = this.resolveSeverity(signals, threshold);
    const explanation = this.buildExplanation(normalizedAsset, snapshot.bridge?.name ?? bridgeName ?? null, signals, threshold);

    this.rememberSnapshot(normalizedAsset, snapshot, tuning.sliding_window_size);

    if (signals.length < threshold.min_signal_count) {
      return {
        assetCode: normalizedAsset,
        bridgeName: snapshot.bridge?.name ?? bridgeName ?? null,
        anomaly: false,
        signals,
        explanation,
      };
    }

    const fingerprint = this.fingerprint(normalizedAsset, snapshot.bridge?.name ?? bridgeName ?? null, signals);
    const duplicateSince = new Date(Date.now() - threshold.duplicate_window_seconds * 1000);
    const now = new Date();
    const activeOverride = await this.model.findActiveTuningOverride(
      type,
      normalizedAsset,
      snapshot.bridge?.name ?? bridgeName ?? null,
      now
    );
    const duplicate = activeOverride ? undefined : await this.model.findRecentFingerprint(fingerprint, duplicateSince);
    const suppressedUntil = activeOverride?.expires_at ?? new Date(now.getTime() + threshold.duplicate_window_seconds * 1000);
    const event = await this.model.insertEvent({
      asset_code: normalizedAsset,
      bridge_name: snapshot.bridge?.name ?? bridgeName ?? null,
      type,
      severity,
      signals,
      explanation,
      metadata: {
        thresholdId: threshold.id ?? null,
        tuningProfileId: tuning.id ?? null,
        deviationMultiplier: tuning.deviation_multiplier,
        slidingWindowSize: tuning.sliding_window_size,
        tuningOverrideId: activeOverride?.id ?? null,
        tuningOverrideReason: activeOverride?.reason ?? null,
        priceLastUpdated: snapshot.price?.lastUpdated ?? null,
        liquidityLastUpdated: snapshot.liquidity?.lastUpdated ?? null,
        healthLastUpdated: snapshot.health?.lastUpdated ?? null,
        bridgeLastChecked: snapshot.bridge?.lastChecked ?? null,
      },
      fingerprint,
      detected_at: now,
      suppressed_until: duplicate || activeOverride ? suppressedUntil : null,
      is_suppressed: Boolean(duplicate || activeOverride),
      suppressed_by_event_id: duplicate?.id ?? null,
    });

    if (!event.is_suppressed) {
      logger.warn({ eventId: event.id, assetCode: normalizedAsset, severity, type }, "Anomaly detected");
    }

    return {
      assetCode: normalizedAsset,
      bridgeName: event.bridge_name,
      anomaly: !event.is_suppressed,
      event,
      signals,
      explanation,
      suppressed: event.is_suppressed,
    };
  }

  getRecentEvents(filters: Parameters<AnomalyModel["getRecentEvents"]>[0]) {
    return this.model.getRecentEvents(filters);
  }

  getThresholds() {
    return this.model.getThresholds();
  }

  upsertThreshold(input: Omit<AnomalyThresholdRecord, "id" | "created_at" | "updated_at">) {
    return this.model.upsertThreshold({
      ...input,
      asset_code: input.asset_code.toUpperCase(),
      bridge_name: input.bridge_name || "*",
    });
  }

  getTuningProfile() {
    return this.model.getActiveTuningProfile();
  }

  updateTuningProfile(input: {
    deviationMultiplier: number;
    slidingWindowSize: number;
    updatedBy: string | null;
  }) {
    return this.model.updateActiveTuningProfile({
      deviation_multiplier: input.deviationMultiplier,
      sliding_window_size: input.slidingWindowSize,
      updated_by: input.updatedBy,
    });
  }

  getTuningOverrides() {
    return this.model.getActiveTuningOverrides();
  }

  createTuningOverride(input: {
    anomalyType?: AnomalyType | "*";
    assetCode?: string;
    bridgeName?: string;
    reason: string;
    startsAt?: Date;
    expiresAt: Date;
    createdBy: string | null;
  }): Promise<AnomalyTuningOverrideRecord> {
    return this.model.createTuningOverride({
      anomaly_type: input.anomalyType ?? "*",
      asset_code: input.assetCode?.toUpperCase() ?? "*",
      bridge_name: input.bridgeName ?? "*",
      reason: input.reason,
      starts_at: input.startsAt ?? new Date(),
      expires_at: input.expiresAt,
      created_by: input.createdBy,
    });
  }

  deleteTuningOverride(id: string) {
    return this.model.deleteTuningOverride(id);
  }

  private async collectSnapshot(assetCode: string, bridgeName?: string): Promise<DetectionSnapshot> {
    const [priceResult, liquidityResult, healthResult, bridgeResult] = await Promise.allSettled([
      this.priceService.getAggregatedPrice(assetCode),
      this.liquidityService.getAggregatedLiquidity(assetCode),
      this.healthService.getHealthScore(assetCode),
      this.bridgeService.getAllBridgeStatuses(),
    ]);

    const bridges = bridgeResult.status === "fulfilled" ? bridgeResult.value.bridges : [];
    const bridge = bridgeName
      ? bridges.find((item) => item.name === bridgeName) ?? null
      : this.findBridgeForAsset(bridges, assetCode) ?? null;

    return {
      assetCode,
      price: priceResult.status === "fulfilled" ? priceResult.value : null,
      liquidity: liquidityResult.status === "fulfilled" ? liquidityResult.value : null,
      health: healthResult.status === "fulfilled" ? healthResult.value : null,
      bridge,
    };
  }

  private detectSignals(
    snapshot: DetectionSnapshot,
    threshold: AnomalyThresholdRecord,
    tuning: AnomalyTuningProfileRecord
  ): DetectionSignal[] {
    const signals: DetectionSignal[] = [];
    const history = (this.snapshotHistory.get(snapshot.assetCode) ?? []).slice(-tuning.sliding_window_size);
    const previous = history.at(-1);

    const priceBaseline = snapshot.price
      ? calculateBaselineDeviation(history.flatMap((item) => item.price === undefined ? [] : [item.price]), snapshot.price.vwap)
      : null;
    if (snapshot.price && priceBaseline && Math.abs(priceBaseline.score) >= tuning.deviation_multiplier) {
      signals.push({
        type: "price",
        direction: priceBaseline.score > 0 ? "spike" : "drop",
        metric: "vwap_baseline_deviation",
        current: snapshot.price.vwap,
        previous: Number(priceBaseline.mean.toFixed(6)),
        threshold: `${tuning.deviation_multiplier} standard deviations`,
        delta: Number(priceBaseline.score.toFixed(4)),
      });
    } else if (snapshot.price && previous?.price && previous.price > 0) {
      const delta = ((snapshot.price.vwap - previous.price) / previous.price) * 100;
      if (Math.abs(delta) >= threshold.price_change_pct) {
        signals.push({
          type: "price",
          direction: delta > 0 ? "spike" : "drop",
          metric: "vwap",
          current: snapshot.price.vwap,
          previous: previous.price,
          threshold: threshold.price_change_pct,
          delta: Number(delta.toFixed(4)),
        });
      }
    }

    if (snapshot.price && snapshot.price.deviation * 100 >= threshold.price_change_pct) {
      signals.push({
        type: "price",
        direction: "divergence",
        metric: "source_deviation_pct",
        current: Number((snapshot.price.deviation * 100).toFixed(4)),
        threshold: threshold.price_change_pct,
      });
    }

    const liquidityBaseline = snapshot.liquidity
      ? calculateBaselineDeviation(
          history.flatMap((item) => item.liquidity === undefined ? [] : [item.liquidity]),
          snapshot.liquidity.totalLiquidity
        )
      : null;
    if (snapshot.liquidity && liquidityBaseline && Math.abs(liquidityBaseline.score) >= tuning.deviation_multiplier) {
      signals.push({
        type: "liquidity",
        direction: liquidityBaseline.score > 0 ? "spike" : "drop",
        metric: "total_liquidity_baseline_deviation",
        current: snapshot.liquidity.totalLiquidity,
        previous: Number(liquidityBaseline.mean.toFixed(6)),
        threshold: `${tuning.deviation_multiplier} standard deviations`,
        delta: Number(liquidityBaseline.score.toFixed(4)),
      });
    } else if (snapshot.liquidity && previous?.liquidity && previous.liquidity > 0) {
      const delta = ((snapshot.liquidity.totalLiquidity - previous.liquidity) / previous.liquidity) * 100;
      if (Math.abs(delta) >= threshold.liquidity_change_pct) {
        signals.push({
          type: "liquidity",
          direction: delta > 0 ? "spike" : "drop",
          metric: "total_liquidity",
          current: snapshot.liquidity.totalLiquidity,
          previous: previous.liquidity,
          threshold: threshold.liquidity_change_pct,
          delta: Number(delta.toFixed(4)),
        });
      }
    }

    if (snapshot.bridge && snapshot.bridge.mismatchPercentage >= threshold.supply_mismatch_pct) {
      signals.push({
        type: "supply",
        direction: "divergence",
        metric: "supply_mismatch_pct",
        current: Number(snapshot.bridge.mismatchPercentage.toFixed(4)),
        threshold: threshold.supply_mismatch_pct,
      });
    }

    if (snapshot.bridge && snapshot.bridge.status !== "healthy") {
      signals.push({
        type: "bridge_health",
        direction: "degraded",
        metric: "bridge_status",
        current: snapshot.bridge.status,
        threshold: "healthy",
      });
    }

    if (snapshot.health && previous?.healthScore !== undefined) {
      const drop = previous.healthScore - snapshot.health.overallScore;
      if (drop >= threshold.health_score_drop) {
        signals.push({
          type: "health_score",
          direction: "drop",
          metric: "overall_score",
          current: snapshot.health.overallScore,
          previous: previous.healthScore,
          threshold: threshold.health_score_drop,
          delta: Number(drop.toFixed(4)),
        });
      }
    }

    return signals;
  }

  private resolveThreshold(thresholds: AnomalyThresholdRecord[], assetCode: string, bridgeName: string): AnomalyThresholdRecord {
    return (
      thresholds.find((item) => item.asset_code === assetCode && item.bridge_name === bridgeName) ??
      thresholds.find((item) => item.asset_code === assetCode && item.bridge_name === "*") ??
      thresholds.find((item) => item.asset_code === "*" && item.bridge_name === bridgeName) ??
      thresholds.find((item) => item.asset_code === "*" && item.bridge_name === "*") ??
      {
        asset_code: "*",
        bridge_name: "*",
        price_change_pct: 5,
        liquidity_change_pct: 25,
        supply_mismatch_pct: 1,
        health_score_drop: 10,
        min_signal_count: 2,
        duplicate_window_seconds: 900,
        is_active: true,
      }
    );
  }

  private resolveType(signals: DetectionSignal[]): AnomalyType {
    if (signals.length > 1) return "multi_signal";
    const signal = signals[0];
    if (!signal) return "multi_signal";
    if (signal.type === "bridge_health") return "bridge_health";
    return signal.direction === "degraded" ? "bridge_health" : signal.direction;
  }

  private resolveSeverity(signals: DetectionSignal[], threshold: AnomalyThresholdRecord): AnomalySeverity {
    let severity: AnomalySeverity = signals.length >= 3 ? "high" : "medium";

    for (const signal of signals) {
      let candidate: AnomalySeverity = "medium";
      if (signal.type === "bridge_health" && signal.current === "down") candidate = "critical";
      if (signal.type === "supply" && Number(signal.current) >= threshold.supply_mismatch_pct * 3) candidate = "critical";
      if (signal.type === "price" && Math.abs(Number(signal.delta ?? signal.current)) >= threshold.price_change_pct * 3) candidate = "high";
      if (signal.type === "liquidity" && Math.abs(Number(signal.delta ?? 0)) >= threshold.liquidity_change_pct * 2) candidate = "high";
      if (SEVERITY_WEIGHT[candidate] > SEVERITY_WEIGHT[severity]) severity = candidate;
    }

    return severity;
  }

  private buildExplanation(
    assetCode: string,
    bridgeName: string | null,
    signals: DetectionSignal[],
    threshold: AnomalyThresholdRecord
  ): DetectionExplanation {
    const scope = bridgeName ? `${assetCode} on ${bridgeName}` : assetCode;
    return {
      summary: signals.length > 0
        ? `${scope} matched ${signals.length} anomaly signal(s); ${threshold.min_signal_count} correlated signal(s) required for alerting.`
        : `${scope} did not match anomaly thresholds.`,
      rules: [
        `Price movement or source divergence >= ${threshold.price_change_pct}%`,
        `Liquidity movement >= ${threshold.liquidity_change_pct}%`,
        `Supply mismatch >= ${threshold.supply_mismatch_pct}%`,
        `Health score drop >= ${threshold.health_score_drop}`,
        `Alert when at least ${threshold.min_signal_count} signal(s) correlate`,
      ],
      evidence: signals,
    };
  }

  private rememberSnapshot(assetCode: string, snapshot: DetectionSnapshot, windowSize: number): void {
    const history = this.snapshotHistory.get(assetCode) ?? [];
    history.push({
      price: snapshot.price?.vwap,
      liquidity: snapshot.liquidity?.totalLiquidity,
      healthScore: snapshot.health?.overallScore,
    });
    this.snapshotHistory.set(assetCode, history.slice(-windowSize));
  }

  private fingerprint(assetCode: string, bridgeName: string | null, signals: DetectionSignal[]): string {
    const parts = signals.map((signal) => `${signal.type}:${signal.direction}:${signal.metric}`).sort();
    return crypto.createHash("sha256").update([assetCode, bridgeName ?? "*", ...parts].join("|")).digest("hex");
  }

  private findBridgeForAsset(bridges: BridgeStatus[], assetCode: string): BridgeStatus | undefined {
    return bridges.find((bridge) => bridge.name.toUpperCase().includes(assetCode));
  }
}

export const anomalyDetectionService = new AnomalyDetectionService();
