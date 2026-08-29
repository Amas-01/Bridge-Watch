import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CrossChainAnomalyEngineService,
  getCrossChainAnomalyEngineService,
} from "../../src/services/crossChainAnomalyEngine.service.js";
import type { FederatedEvent } from "../../src/services/eventFederation/types.js";
import * as circuitBreakerModule from "../../src/services/circuitBreaker.service.js";
import * as metricsModule from "../../src/services/metrics.service.js";

describe("CrossChainAnomalyEngineService", () => {
  let engine: CrossChainAnomalyEngineService;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new CrossChainAnomalyEngineService({
      windowSeconds: 5,
      anomalyThreshold: 2,
      nonceWindowSeconds: 3600,
      txHashWindowSeconds: 3600,
    });
  });

  const createEvent = (overrides: Partial<FederatedEvent> = {}): FederatedEvent => ({
    id: `evt_${Date.now()}_${Math.random()}`,
    chain: "stellar",
    type: "bridge_lock",
    blockNumber: 100,
    timestamp: new Date().toISOString(),
    sourceId: `tx_${Math.random()}`,
    raw: {
      bridgeId: "usdc-stellar-eth",
      depositTxHash: "0x123abc456def789",
      sequenceId: 100,
    },
    ...overrides,
  });

  describe("processEvent", () => {
    it("processes legitimate sequential events cleanly without anomalies", async () => {
      const event1 = createEvent({
        id: "evt_1",
        chain: "stellar",
        blockNumber: 100,
        raw: { bridgeId: "usdc-bridge", depositTxHash: "0xhash1", sequenceId: 100 },
      });

      const anomalies1 = await engine.processEvent(event1);
      expect(anomalies1).toEqual([]);

      const event2 = createEvent({
        id: "evt_2",
        chain: "stellar",
        blockNumber: 101,
        raw: { bridgeId: "usdc-bridge", depositTxHash: "0xhash2", sequenceId: 101 },
      });

      const anomalies2 = await engine.processEvent(event2);
      expect(anomalies2).toEqual([]);
    });

    it("detects double-spend attempt across chains/relayers", async () => {
      const depositHash = "0xdouble_spend_hash_999";

      const eventEthereum = createEvent({
        id: "evt_eth_1",
        chain: "ethereum",
        raw: { bridgeId: "usdc-bridge", depositTxHash: depositHash, sequenceId: 200 },
      });

      await engine.processEvent(eventEthereum);

      const eventStellarDouble = createEvent({
        id: "evt_stl_1",
        chain: "stellar",
        raw: { bridgeId: "usdc-bridge", depositTxHash: depositHash, sequenceId: 201 },
      });

      const anomalies = await engine.processEvent(eventStellarDouble);

      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      const dsAnomaly = anomalies.find((a) => a.type === "double_spend");
      expect(dsAnomaly).toBeDefined();
      expect(dsAnomaly?.depositTxHash).toBe(depositHash);
      expect(dsAnomaly?.bridgeId).toBe("usdc-bridge");
    });

    it("detects out-of-order sequence nonce jumps", async () => {
      const event1 = createEvent({
        id: "evt_seq_1",
        chain: "stellar",
        raw: { bridgeId: "usdc-bridge", sequenceId: 50 },
      });

      await engine.processEvent(event1);

      // Sequence jumps from 50 to 55 (jump > 1)
      const eventJump = createEvent({
        id: "evt_seq_jump",
        chain: "stellar",
        raw: { bridgeId: "usdc-bridge", sequenceId: 55 },
      });

      const anomalies = await engine.processEvent(eventJump);

      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      const jumpAnomaly = anomalies.find((a) => a.type === "nonce_jump");
      expect(jumpAnomaly).toBeDefined();
      expect(jumpAnomaly?.sequenceId).toBe(55);
    });

    it("detects cross-chain re-entrancy attack pattern", async () => {
      const sharedSourceId = "reentrancy_source_tx_77";

      const event1 = createEvent({
        id: "evt_re_1",
        chain: "ethereum",
        sourceId: sharedSourceId,
        raw: { bridgeId: "reentrancy-bridge", depositTxHash: "0xre1" },
      });

      await engine.processEvent(event1);

      // Rapid sub-second duplicate call with same sourceId
      const eventReentrant = createEvent({
        id: "evt_re_2",
        chain: "ethereum",
        sourceId: sharedSourceId,
        raw: { bridgeId: "reentrancy-bridge", depositTxHash: "0xre2" },
      });

      const anomalies = await engine.processEvent(eventReentrant);

      expect(anomalies.length).toBeGreaterThanOrEqual(1);
      const reAnomaly = anomalies.find((a) => a.type === "reentrancy");
      expect(reAnomaly).toBeDefined();
    });
  });

  describe("Automated Flash-Pause", () => {
    it("triggers automated Flash-Pause when anomaly threshold is breached within 5s window", async () => {
      const triggerPauseSpy = vi.fn().mockResolvedValue(undefined);
      vi.spyOn(circuitBreakerModule, "getCircuitBreakerService").mockReturnValue({
        triggerPause: triggerPauseSpy,
      } as any);

      vi.spyOn(metricsModule, "getMetricsService").mockReturnValue({
        circuitBreakerTrips: { inc: vi.fn() },
      } as any);

      const bridgeId = "flash-pause-bridge";
      const depositHash1 = "0xhash_fp_1";
      const depositHash2 = "0xhash_fp_2";

      // Trigger anomaly 1: double spend
      await engine.processEvent(
        createEvent({
          id: "evt_fp_1",
          chain: "ethereum",
          raw: { bridgeId, depositTxHash: depositHash1, sequenceId: 10 },
        })
      );

      await engine.processEvent(
        createEvent({
          id: "evt_fp_2",
          chain: "stellar",
          raw: { bridgeId, depositTxHash: depositHash1, sequenceId: 11 },
        })
      );

      // Trigger anomaly 2: double spend for hash2
      await engine.processEvent(
        createEvent({
          id: "evt_fp_3",
          chain: "ethereum",
          raw: { bridgeId, depositTxHash: depositHash2, sequenceId: 12 },
        })
      );

      await engine.processEvent(
        createEvent({
          id: "evt_fp_4",
          chain: "stellar",
          raw: { bridgeId, depositTxHash: depositHash2, sequenceId: 13 },
        })
      );

      const isActive = await engine.isEmergencyBreakerActive(bridgeId);
      expect(isActive).toBe(true);

      // Verify triggerPause on CircuitBreakerService was called
      expect(triggerPauseSpy).toHaveBeenCalledWith(
        expect.anything(),
        circuitBreakerModule.PauseScope.Bridge,
        bridgeId,
        expect.stringContaining("Automated Flash-Pause")
      );
    });

    it("allows manual emergency breaker reset", async () => {
      const bridgeId = "reset-bridge";

      // Manually trigger flash pause
      await engine.triggerFlashPause(bridgeId, [], "Test pause");

      let isActive = await engine.isEmergencyBreakerActive(bridgeId);
      expect(isActive).toBe(true);

      await engine.resetEmergencyBreaker(bridgeId);

      isActive = await engine.isEmergencyBreakerActive(bridgeId);
      expect(isActive).toBe(false);
    });
  });

  describe("Singleton Factory", () => {
    it("returns singleton instance of CrossChainAnomalyEngineService", () => {
      const instance1 = getCrossChainAnomalyEngineService();
      const instance2 = getCrossChainAnomalyEngineService();
      expect(instance1).toBe(instance2);
    });
  });
});
