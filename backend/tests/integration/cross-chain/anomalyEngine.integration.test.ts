import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventFederationService } from "../../../src/services/eventFederation/EventFederationService.js";
import { getCrossChainAnomalyEngineService } from "../../../src/services/crossChainAnomalyEngine.service.js";
import type { FederatedEvent } from "../../../src/services/eventFederation/types.js";
import * as circuitBreakerModule from "../../../src/services/circuitBreaker.service.js";

describe("Cross-Chain Anomaly Engine Integration Test", () => {
  let federation: EventFederationService;

  beforeEach(async () => {
    vi.clearAllMocks();
    federation = new EventFederationService();
  });

  afterEach(async () => {
    await federation.stop();
  });

  it("ingests federated stream events and triggers automated Flash-Pause during double-mint exploit simulation", async () => {
    const triggerPauseSpy = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(circuitBreakerModule, "getCircuitBreakerService").mockReturnValue({
      triggerPause: triggerPauseSpy,
    } as any);

    const anomalyEngine = getCrossChainAnomalyEngineService({
      windowSeconds: 5,
      anomalyThreshold: 2,
    });

    const bridgeId = "eth-stellar-usdc-bridge";
    const depositTxHash1 = "0xdeposit_exploit_hash_001";
    const depositTxHash2 = "0xdeposit_exploit_hash_002";

    // Simulate cross-chain double mint exploit across 2 relayers
    const event1: FederatedEvent = {
      id: "evt_relayer_eth_1",
      chain: "ethereum",
      type: "bridge_lock",
      blockNumber: 1000,
      timestamp: new Date().toISOString(),
      sourceId: "eth_tx_1000",
      raw: { bridgeId, depositTxHash: depositTxHash1, sequenceId: 50 },
    };

    const event2: FederatedEvent = {
      id: "evt_relayer_stellar_1",
      chain: "stellar",
      type: "bridge_release",
      blockNumber: 2000,
      timestamp: new Date().toISOString(),
      sourceId: "stl_tx_2000",
      raw: { bridgeId, depositTxHash: depositTxHash1, sequenceId: 51 },
    };

    const event3: FederatedEvent = {
      id: "evt_relayer_eth_2",
      chain: "ethereum",
      type: "bridge_lock",
      blockNumber: 1001,
      timestamp: new Date().toISOString(),
      sourceId: "eth_tx_1001",
      raw: { bridgeId, depositTxHash: depositTxHash2, sequenceId: 52 },
    };

    const event4: FederatedEvent = {
      id: "evt_relayer_stellar_2",
      chain: "stellar",
      type: "bridge_release",
      blockNumber: 2001,
      timestamp: new Date().toISOString(),
      sourceId: "stl_tx_2001",
      raw: { bridgeId, depositTxHash: depositTxHash2, sequenceId: 53 },
    };

    // Ingest events
    await anomalyEngine.processEvent(event1);
    await anomalyEngine.processEvent(event2); // Anomaly 1: Double-spend for depositTxHash1
    await anomalyEngine.processEvent(event3);
    await anomalyEngine.processEvent(event4); // Anomaly 2: Double-spend for depositTxHash2 -> Threshold 2 breached!

    const isBreakerActive = await anomalyEngine.isEmergencyBreakerActive(bridgeId);
    expect(isBreakerActive).toBe(true);

    expect(triggerPauseSpy).toHaveBeenCalledWith(
      expect.anything(),
      circuitBreakerModule.PauseScope.Bridge,
      bridgeId,
      expect.stringContaining("Automated Flash-Pause")
    );
  });
});
