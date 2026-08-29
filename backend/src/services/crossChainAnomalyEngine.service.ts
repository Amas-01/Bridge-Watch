import * as StellarSdk from "@stellar/stellar-sdk";
import { redis } from "../utils/redis.js";
import { logger } from "../utils/logger.js";
import { getMetricsService } from "./metrics.service.js";
import { getCircuitBreakerService, PauseScope } from "./circuitBreaker.service.js";
import type { FederatedEvent } from "./eventFederation/types.js";
import { getDatabase } from "../database/connection.js";

export type AnomalyType = "double_spend" | "nonce_jump" | "reentrancy" | "threshold_breach";

export interface DetectedAnomaly {
  id: string;
  type: AnomalyType;
  bridgeId: string;
  chainId: string;
  sequenceId?: number;
  depositTxHash?: string;
  details: Record<string, unknown>;
  timestamp: number;
}

export interface FlashPauseResult {
  triggered: boolean;
  bridgeId: string;
  anomalyCount: number;
  reason: string;
  timestamp: number;
  contractPaused: boolean;
}

export interface AnomalyEngineOptions {
  windowSeconds?: number;
  anomalyThreshold?: number;
  nonceWindowSeconds?: number;
  txHashWindowSeconds?: number;
}

export class CrossChainAnomalyEngineService {
  private readonly windowSeconds: number;
  private readonly anomalyThreshold: number;
  private readonly nonceWindowSeconds: number;
  private readonly txHashWindowSeconds: number;

  // L1 In-Memory sliding window and state cache for sub-millisecond graph analysis
  private readonly memoryStore = new Map<string, string | number>();
  private readonly memoryAnomalies = new Map<string, DetectedAnomaly[]>();
  private readonly memoryBreakers = new Map<string, boolean>();

  constructor(options: AnomalyEngineOptions = {}) {
    this.windowSeconds = options.windowSeconds ?? 5;
    this.anomalyThreshold = options.anomalyThreshold ?? 2;
    this.nonceWindowSeconds = options.nonceWindowSeconds ?? 3600;
    this.txHashWindowSeconds = options.txHashWindowSeconds ?? 3600;
  }

  /**
   * Main entry point for ingesting real-time federated stream events.
   * Analyzes event for double-spend attempts, out-of-order sequence nonce jumps, and cross-chain re-entrancy.
   */
  async processEvent(event: FederatedEvent): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];
    const now = Date.now();
    const bridgeId = this.extractBridgeId(event);
    const chainId = event.chain || "unknown";

    const depositTxHash = this.extractDepositTxHash(event);
    const sequenceId = this.extractSequenceId(event);

    // 1. Double-Spend Anomaly Detection (Duplicate deposit tx hash across chains/relayers)
    if (depositTxHash) {
      const isDoubleSpend = await this.checkDoubleSpend(bridgeId, chainId, depositTxHash, now);
      if (isDoubleSpend) {
        const anomaly: DetectedAnomaly = {
          id: `ds_${event.id}_${now}`,
          type: "double_spend",
          bridgeId,
          chainId,
          depositTxHash,
          sequenceId,
          details: {
            message: `Double-spend deposit tx hash detected: ${depositTxHash}`,
            eventId: event.id,
            sourceId: event.sourceId,
          },
          timestamp: now,
        };
        anomalies.push(anomaly);
      }
    }

    // 2. Out-of-Order Sequence Nonce Jump Detection
    if (sequenceId !== undefined && sequenceId !== null) {
      const isNonceJump = await this.checkNonceJump(bridgeId, chainId, sequenceId, now);
      if (isNonceJump) {
        const anomaly: DetectedAnomaly = {
          id: `nj_${event.id}_${now}`,
          type: "nonce_jump",
          bridgeId,
          chainId,
          sequenceId,
          depositTxHash,
          details: {
            message: `Out-of-order sequence nonce jump detected: sequenceId ${sequenceId}`,
            eventId: event.id,
            sourceId: event.sourceId,
          },
          timestamp: now,
        };
        anomalies.push(anomaly);
      }
    }

    // 3. Cross-Chain Re-Entrancy Detection (rapid sub-second duplicate calls for same reference)
    const isReentrancy = await this.checkReentrancy(bridgeId, chainId, event, now);
    if (isReentrancy) {
      const anomaly: DetectedAnomaly = {
        id: `re_${event.id}_${now}`,
        type: "reentrancy",
        bridgeId,
        chainId,
        depositTxHash,
        sequenceId,
        details: {
          message: `Cross-chain re-entrancy pattern detected within sub-second block window`,
          eventId: event.id,
          sourceId: event.sourceId,
        },
        timestamp: now,
      };
      anomalies.push(anomaly);
    }

    // Record any detected anomalies and evaluate 5-second Flash-Pause threshold
    if (anomalies.length > 0) {
      for (const anomaly of anomalies) {
        await this.recordAnomaly(anomaly);
      }

      await this.evaluateFlashPauseThreshold(bridgeId, anomalies);
    }

    return anomalies;
  }

  /**
   * Checks if deposit transaction hash was already processed or seen on another chain/relayer.
   */
  private async checkDoubleSpend(
    bridgeId: string,
    chainId: string,
    txHash: string,
    now: number
  ): Promise<boolean> {
    const key = `ccae:txhash:${bridgeId}:${txHash}`;
    const memChain = this.memoryStore.get(key) as string | undefined;
    let existingChain: string | null = memChain ?? null;

    if (!existingChain) {
      try {
        existingChain = await redis.get(key);
      } catch {
        existingChain = null;
      }
    }

    if (existingChain && existingChain !== chainId) {
      return true;
    }

    this.memoryStore.set(key, chainId);
    try {
      await redis.set(key, chainId, "EX", this.txHashWindowSeconds);
    } catch {
      // Redis optional L2
    }

    return false;
  }

  /**
   * Tracks sequence nonce per bridge/chain and flags jumps or duplicate/regressive nonces.
   */
  private async checkNonceJump(
    bridgeId: string,
    chainId: string,
    sequenceId: number,
    now: number
  ): Promise<boolean> {
    const key = `ccae:seq:${bridgeId}:${chainId}`;
    const memSeq = this.memoryStore.get(key);
    let lastSeqStr: string | null = memSeq !== undefined ? String(memSeq) : null;

    if (lastSeqStr === null) {
      try {
        lastSeqStr = await redis.get(key);
      } catch {
        lastSeqStr = null;
      }
    }

    let isJump = false;
    if (lastSeqStr !== null && lastSeqStr !== undefined) {
      const lastSeq = parseInt(lastSeqStr, 10);
      if (!isNaN(lastSeq)) {
        if (sequenceId > lastSeq + 1 || sequenceId <= lastSeq) {
          isJump = true;
        }
      }
    }

    this.memoryStore.set(key, sequenceId);
    try {
      await redis.set(key, String(sequenceId), "EX", this.nonceWindowSeconds);
    } catch {
      // Redis optional L2
    }

    return isJump;
  }

  /**
   * Detects rapid sub-second execution with identical key parameters (re-entrancy signature).
   */
  private async checkReentrancy(
    bridgeId: string,
    chainId: string,
    event: FederatedEvent,
    now: number
  ): Promise<boolean> {
    const refKey = event.sourceId || event.id;
    const key = `ccae:reentrancy:${bridgeId}:${refKey}`;

    const memLastSeen = this.memoryStore.get(key) as number | undefined;
    let lastSeen: number | null = memLastSeen ?? null;

    if (lastSeen === null) {
      try {
        const str = await redis.get(key);
        if (str) lastSeen = parseInt(str, 10);
      } catch {
        lastSeen = null;
      }
    }

    let isReentrant = false;
    if (lastSeen !== null && !isNaN(lastSeen) && now - lastSeen < 1000) {
      isReentrant = true;
    }

    this.memoryStore.set(key, now);
    try {
      await redis.set(key, String(now), "EX", 10);
    } catch {
      // Redis optional L2
    }

    return isReentrant;
  }

  /**
   * Records detected anomaly into L1 Memory + L2 Redis sliding window.
   */
  private async recordAnomaly(anomaly: DetectedAnomaly): Promise<void> {
    const bridgeId = anomaly.bridgeId;
    const list = this.memoryAnomalies.get(bridgeId) ?? [];
    list.push(anomaly);

    const cutoff = anomaly.timestamp - (this.windowSeconds * 1000);
    const filtered = list.filter((a) => a.timestamp >= cutoff);
    this.memoryAnomalies.set(bridgeId, filtered);

    try {
      const windowKey = `ccae:anomalies:${bridgeId}`;
      await redis.zadd(windowKey, anomaly.timestamp, JSON.stringify(anomaly));
      await redis.zremrangebyscore(windowKey, "-inf", cutoff);
      await redis.expire(windowKey, this.windowSeconds * 2);
    } catch {
      // Redis optional L2
    }

    logger.warn({ anomaly }, "Cross-chain anomaly recorded");
  }

  /**
   * Evaluates total anomalies recorded within rolling 5-second window.
   * If threshold is breached, triggers automated Flash-Pause.
   */
  async evaluateFlashPauseThreshold(
    bridgeId: string,
    recentAnomalies: DetectedAnomaly[]
  ): Promise<FlashPauseResult> {
    const now = Date.now();
    const cutoff = now - (this.windowSeconds * 1000);

    const memList = (this.memoryAnomalies.get(bridgeId) ?? []).filter((a) => a.timestamp >= cutoff);
    this.memoryAnomalies.set(bridgeId, memList);

    let anomalyCount = memList.length;

    try {
      const windowKey = `ccae:anomalies:${bridgeId}`;
      await redis.zremrangebyscore(windowKey, "-inf", cutoff);
      const anomaliesInWindow = await redis.zrangebyscore(windowKey, cutoff, "+inf");
      if (Array.isArray(anomaliesInWindow) && anomaliesInWindow.length > anomalyCount) {
        anomalyCount = anomaliesInWindow.length;
      }
    } catch {
      // Redis optional L2
    }

    if (anomalyCount >= this.anomalyThreshold) {
      const reason = `Automated Flash-Pause: ${anomalyCount} cross-chain anomalies detected within ${this.windowSeconds}s window`;
      return this.triggerFlashPause(bridgeId, recentAnomalies, reason);
    }

    return {
      triggered: false,
      bridgeId,
      anomalyCount,
      reason: "Below threshold",
      timestamp: now,
      contractPaused: false,
    };
  }

  /**
   * Triggers an automated Flash-Pause directly invoking Soroban pause_contract RPC and setting emergency breaker flags.
   */
  async triggerFlashPause(
    bridgeId: string,
    anomalies: DetectedAnomaly[],
    reason: string,
    signer?: StellarSdk.Keypair
  ): Promise<FlashPauseResult> {
    const now = Date.now();
    const breakerKey = `ccae:breaker:${bridgeId}`;

    this.memoryBreakers.set(bridgeId, true);

    try {
      await redis.set(
        breakerKey,
        JSON.stringify({
          active: true,
          triggeredAt: now,
          reason,
          anomalyCount: anomalies.length,
        }),
        "EX",
        86400
      );
    } catch {
      // Redis optional L2
    }

    let contractPaused = false;
    const circuitBreaker = getCircuitBreakerService();

    if (circuitBreaker) {
      try {
        const keypair = signer || StellarSdk.Keypair.random();
        await circuitBreaker.triggerPause(keypair, PauseScope.Bridge, bridgeId, reason);
        contractPaused = true;
        logger.info({ bridgeId, reason }, "Soroban contract pause_bridge invoked successfully");
      } catch (err) {
        logger.error({ err, bridgeId }, "Failed invoking Soroban contract pause_bridge RPC");
      }
    }

    try {
      const metricsService = getMetricsService();
      metricsService.circuitBreakerTrips.inc({
        bridge_id: bridgeId,
        reason: "flash_pause_anomaly",
      });
    } catch (err) {
      logger.warn({ err }, "Could not update metrics for flash pause");
    }

    try {
      const db = getDatabase();
      const SYSTEM_RULE_ID = "00000000-0000-0000-0000-000000000000";
      await db("alert_events").insert({
        rule_id: SYSTEM_RULE_ID,
        asset_code: bridgeId,
        alert_type: "cross_chain_flash_pause",
        priority: "critical",
        triggered_value: anomalies.length,
        threshold: this.anomalyThreshold,
        metric: "cross_chain_anomaly_threshold",
        webhook_delivered: false,
        webhook_attempts: 0,
      });
    } catch (err) {
      logger.warn({ err }, "Could not persist flash pause alert event to DB");
    }

    logger.error({ bridgeId, reason, anomalyCount: anomalies.length }, "EMERGENCY FLASH-PAUSE TRIGGERED");

    return {
      triggered: true,
      bridgeId,
      anomalyCount: anomalies.length,
      reason,
      timestamp: now,
      contractPaused,
    };
  }

  /**
   * Checks whether the emergency breaker is active for a given bridge.
   */
  async isEmergencyBreakerActive(bridgeId: string): Promise<boolean> {
    if (this.memoryBreakers.get(bridgeId) === true) {
      return true;
    }

    const breakerKey = `ccae:breaker:${bridgeId}`;
    try {
      const data = await redis.get(breakerKey);
      if (!data) return false;
      const parsed = JSON.parse(data);
      return Boolean(parsed.active);
    } catch {
      return false;
    }
  }

  /**
   * Resets emergency breaker state flag.
   */
  async resetEmergencyBreaker(bridgeId: string): Promise<void> {
    const breakerKey = `ccae:breaker:${bridgeId}`;
    const windowKey = `ccae:anomalies:${bridgeId}`;

    this.memoryBreakers.delete(bridgeId);
    this.memoryAnomalies.delete(bridgeId);

    try {
      await redis.del(breakerKey);
      await redis.del(windowKey);
    } catch {
      // Redis optional L2
    }

    logger.info({ bridgeId }, "Emergency breaker state reset");
  }

  /**
   * Helper to extract bridge ID from event payload.
   */
  private extractBridgeId(event: FederatedEvent): string {
    const raw = event.raw ?? {};
    if (typeof raw.bridgeId === "string") return raw.bridgeId;
    if (typeof raw.bridge_id === "string") return raw.bridge_id;
    if (event.assetCode) return event.assetCode;
    return "default-bridge";
  }

  /**
   * Helper to extract deposit transaction hash from event payload.
   */
  private extractDepositTxHash(event: FederatedEvent): string | undefined {
    const raw = event.raw ?? {};
    if (typeof raw.depositTxHash === "string") return raw.depositTxHash;
    if (typeof raw.deposit_tx_hash === "string") return raw.deposit_tx_hash;
    if (typeof raw.txHash === "string") return raw.txHash;
    if (event.type === "bridge_lock" || event.type === "bridge_release") {
      return event.sourceId;
    }
    return undefined;
  }

  /**
   * Helper to extract sequence ID / nonce from event payload.
   */
  private extractSequenceId(event: FederatedEvent): number | undefined {
    const raw = event.raw ?? {};
    if (typeof raw.sequenceId === "number") return raw.sequenceId;
    if (typeof raw.sequence === "number") return raw.sequence;
    if (typeof raw.nonce === "number") return raw.nonce;
    if (event.blockNumber > 0) return event.blockNumber;
    return undefined;
  }
}

let _instance: CrossChainAnomalyEngineService | null = null;

export function getCrossChainAnomalyEngineService(options?: AnomalyEngineOptions): CrossChainAnomalyEngineService {
  if (!_instance || options) {
    _instance = new CrossChainAnomalyEngineService(options);
  }
  return _instance;
}
