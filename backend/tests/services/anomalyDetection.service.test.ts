import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared mock fns for the model and dependent services so each test can drive
// the detection inputs deterministically.
const mocks = vi.hoisted(() => ({
  getActiveThresholds: vi.fn(),
  findRecentFingerprint: vi.fn(),
  insertEvent: vi.fn(),
  getRecentEvents: vi.fn(),
  getThresholds: vi.fn(),
  upsertThreshold: vi.fn(),
  getAggregatedPrice: vi.fn(),
  getAggregatedLiquidity: vi.fn(),
  getHealthScore: vi.fn(),
  getAllBridgeStatuses: vi.fn(),
}));

vi.mock("../../src/database/models/anomaly.model", () => ({
  AnomalyModel: vi.fn(() => ({
    getActiveThresholds: mocks.getActiveThresholds,
    findRecentFingerprint: mocks.findRecentFingerprint,
    insertEvent: mocks.insertEvent,
    getRecentEvents: mocks.getRecentEvents,
    getThresholds: mocks.getThresholds,
    upsertThreshold: mocks.upsertThreshold,
  })),
}));

vi.mock("../../src/services/price.service", () => ({
  PriceService: vi.fn(() => ({ getAggregatedPrice: mocks.getAggregatedPrice })),
}));

vi.mock("../../src/services/liquidity.service", () => ({
  LiquidityService: vi.fn(() => ({ getAggregatedLiquidity: mocks.getAggregatedLiquidity })),
}));

vi.mock("../../src/services/health.service", () => ({
  HealthService: vi.fn(() => ({ getHealthScore: mocks.getHealthScore })),
}));

vi.mock("../../src/services/bridge.service", () => ({
  BridgeService: vi.fn(() => ({ getAllBridgeStatuses: mocks.getAllBridgeStatuses })),
}));

vi.mock("../../src/utils/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { AnomalyDetectionService } from "../../src/services/anomalyDetection.service";
import { logger } from "../../src/utils/logger";

const baseThreshold = {
  id: "th-1",
  asset_code: "*",
  bridge_name: "*",
  price_change_pct: 5,
  liquidity_change_pct: 25,
  supply_mismatch_pct: 1,
  health_score_drop: 10,
  min_signal_count: 2,
  duplicate_window_seconds: 900,
  is_active: true,
};

function bridgeStatus(overrides: Record<string, unknown> = {}) {
  return {
    name: "Circle",
    status: "healthy",
    lastChecked: "2024-01-01T00:00:00Z",
    totalValueLocked: 100,
    supplyOnStellar: 100,
    supplyOnSource: 100,
    mismatchPercentage: 0,
    ...overrides,
  };
}

function priceAgg(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "USDC",
    vwap: 1,
    sources: [],
    deviation: 0,
    lastUpdated: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function liquidityAgg(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "USDC",
    totalLiquidity: 1000,
    sources: [],
    bestBid: { dex: "a", price: 1 },
    bestAsk: { dex: "b", price: 1 },
    lastUpdated: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function healthScore(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "USDC",
    overallScore: 90,
    factors: {
      liquidityDepth: 90,
      priceStability: 90,
      bridgeUptime: 100,
      reserveBacking: 90,
      volumeTrend: 80,
    },
    trend: "stable",
    lastUpdated: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("AnomalyDetectionService", () => {
  let service: AnomalyDetectionService;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getActiveThresholds.mockResolvedValue([baseThreshold]);
    mocks.findRecentFingerprint.mockResolvedValue(undefined);
    // Echo the inserted record back (with an id) so the service reads back the
    // suppression flags it computed.
    mocks.insertEvent.mockImplementation(async (event: Record<string, unknown>) => ({
      ...event,
      id: "evt-1",
    }));
    mocks.getAllBridgeStatuses.mockResolvedValue({ bridges: [bridgeStatus()] });
    mocks.getAggregatedPrice.mockResolvedValue(priceAgg());
    mocks.getAggregatedLiquidity.mockResolvedValue(liquidityAgg());
    mocks.getHealthScore.mockResolvedValue(healthScore());
    service = new AnomalyDetectionService();
  });

  describe("evaluateAsset", () => {
    it("does not emit an event when fewer signals than the minimum correlate", async () => {
      mocks.getAllBridgeStatuses.mockResolvedValue({
        bridges: [bridgeStatus({ status: "degraded", mismatchPercentage: 0 })],
      });

      const result = await service.evaluateAsset("usdc", "Circle");

      expect(result.anomaly).toBe(false);
      expect(result.signals).toHaveLength(1);
      expect(result.assetCode).toBe("USDC");
      expect(mocks.insertEvent).not.toHaveBeenCalled();
      expect(result.explanation.summary).toContain("USDC on Circle");
    });

    it("detects a correlated multi-signal anomaly and inserts an event", async () => {
      mocks.getAllBridgeStatuses.mockResolvedValue({
        bridges: [bridgeStatus({ status: "degraded", mismatchPercentage: 5 })],
      });

      const result = await service.evaluateAsset("USDC", "Circle");

      expect(result.anomaly).toBe(true);
      expect(result.suppressed).toBe(false);
      expect(result.event).toBeDefined();
      expect(result.signals).toHaveLength(2);
      expect(mocks.insertEvent).toHaveBeenCalledTimes(1);

      const inserted = mocks.insertEvent.mock.calls[0][0];
      expect(inserted.asset_code).toBe("USDC");
      expect(inserted.bridge_name).toBe("Circle");
      expect(inserted.type).toBe("multi_signal");
      // supply mismatch 5 is >= 3x the threshold -> critical severity
      expect(inserted.severity).toBe("critical");
      expect(inserted.is_suppressed).toBe(false);
      expect(logger.warn).toHaveBeenCalled();
    });

    it("suppresses duplicate anomalies inside the dedupe window", async () => {
      mocks.getAllBridgeStatuses.mockResolvedValue({
        bridges: [bridgeStatus({ status: "degraded", mismatchPercentage: 5 })],
      });
      mocks.findRecentFingerprint.mockResolvedValue({ id: "prev-event" });

      const result = await service.evaluateAsset("USDC", "Circle");

      expect(result.anomaly).toBe(false);
      expect(result.suppressed).toBe(true);

      const inserted = mocks.insertEvent.mock.calls[0][0];
      expect(inserted.is_suppressed).toBe(true);
      expect(inserted.suppressed_by_event_id).toBe("prev-event");
      expect(inserted.suppressed_until).toBeInstanceOf(Date);
      // Suppressed events should not log a warning.
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("scores a large price move and divergence across consecutive evaluations", async () => {
      // First evaluation seeds the previous snapshot (no prior data => no signals).
      mocks.getAggregatedPrice.mockResolvedValueOnce(priceAgg({ vwap: 1, deviation: 0 }));
      const seed = await service.evaluateAsset("USDC", "Circle");
      expect(seed.anomaly).toBe(false);

      // Second evaluation: +20% vwap move and 10% source divergence.
      mocks.getAggregatedPrice.mockResolvedValueOnce(priceAgg({ vwap: 1.2, deviation: 0.1 }));
      const result = await service.evaluateAsset("USDC", "Circle");

      expect(result.anomaly).toBe(true);
      expect(result.signals).toHaveLength(2);
      expect(result.signals.map((s) => s.direction)).toEqual(
        expect.arrayContaining(["spike", "divergence"])
      );

      const inserted = mocks.insertEvent.mock.calls[0][0];
      // delta 20 >= 3x price_change_pct (15) -> high severity
      expect(inserted.severity).toBe("high");
    });

    it("falls back to default thresholds when none are configured", async () => {
      mocks.getActiveThresholds.mockResolvedValue([]);
      mocks.getAllBridgeStatuses.mockResolvedValue({
        bridges: [bridgeStatus({ status: "degraded", mismatchPercentage: 5 })],
      });

      const result = await service.evaluateAsset("USDC", "Circle");

      expect(result.anomaly).toBe(true);
      expect(mocks.insertEvent).toHaveBeenCalledTimes(1);
    });

    it("is resilient when a data source fails to resolve", async () => {
      mocks.getAggregatedPrice.mockRejectedValue(new Error("price service down"));
      mocks.getAllBridgeStatuses.mockResolvedValue({
        bridges: [bridgeStatus({ status: "degraded", mismatchPercentage: 5 })],
      });

      const result = await service.evaluateAsset("USDC", "Circle");

      expect(result.anomaly).toBe(true);
      expect(result.signals.some((s) => s.type === "price")).toBe(false);
    });
  });

  describe("evaluateAllAssets", () => {
    it("evaluates every supported asset", async () => {
      const results = await service.evaluateAllAssets();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.anomaly === false)).toBe(true);
      expect(mocks.getAllBridgeStatuses).toHaveBeenCalled();
    });
  });

  describe("threshold management pass-throughs", () => {
    it("forwards recent-event queries to the model", async () => {
      mocks.getRecentEvents.mockResolvedValue([]);
      await service.getRecentEvents({ limit: 10 });
      expect(mocks.getRecentEvents).toHaveBeenCalledWith({ limit: 10 });
    });

    it("forwards threshold reads to the model", async () => {
      mocks.getThresholds.mockResolvedValue([baseThreshold]);
      await service.getThresholds();
      expect(mocks.getThresholds).toHaveBeenCalledTimes(1);
    });

    it("normalizes asset code and bridge name on upsert", async () => {
      mocks.upsertThreshold.mockResolvedValue(baseThreshold);

      await service.upsertThreshold({
        asset_code: "usdc",
        bridge_name: "",
        price_change_pct: 5,
        liquidity_change_pct: 25,
        supply_mismatch_pct: 1,
        health_score_drop: 10,
        min_signal_count: 2,
        duplicate_window_seconds: 900,
        is_active: true,
      });

      const arg = mocks.upsertThreshold.mock.calls[0][0];
      expect(arg.asset_code).toBe("USDC");
      expect(arg.bridge_name).toBe("*");
    });
  });
});
