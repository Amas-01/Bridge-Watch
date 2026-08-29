import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlertService, type MetricSnapshot } from "../../src/services/alert.service.js";

const suppressionServiceMock = {
  shouldSuppress: vi.fn().mockResolvedValue({
    suppressed: false,
    matchedRule: null,
    reason: null,
  }),
};

vi.mock("../../src/services/alertRouting.service.js", () => ({
  alertRoutingService: {
    routeAlert: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/workers/circuitBreaker.worker.js", () => ({
  circuitBreakerQueue: {
    add: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/database/connection.js", () => ({
  getDatabase: vi.fn(() => ({
    raw: vi.fn((sql: string) => sql),
    transaction: vi.fn(async (cb: Function) => cb({ where: vi.fn().mockReturnThis(), update: vi.fn().mockResolvedValue(1), insert: vi.fn().mockResolvedValue([]) })),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockResolvedValue(1),
    insert: vi.fn().mockResolvedValue([]),
  })),
}));

describe("AlertService — batchEvaluateParallel", () => {
  let service: AlertService;

  beforeEach(() => {
    suppressionServiceMock.shouldSuppress.mockResolvedValue({
      suppressed: false,
      matchedRule: null,
      reason: null,
    });
    service = new AlertService(suppressionServiceMock as any);
  });

  it("processes snapshots in parallel batches", async () => {
    const mockEvaluateAsset = vi.spyOn(service, "evaluateAsset").mockResolvedValue([]);

    const snapshots: MetricSnapshot[] = [
      { assetCode: "USDC", metrics: { price_deviation_bps: 100 } },
      { assetCode: "EURC", metrics: { price_deviation_bps: 200 } },
      { assetCode: "USDT", metrics: { price_deviation_bps: 150 } },
      { assetCode: "MATIC", metrics: { price_deviation_bps: 120 } },
    ];

    await service.batchEvaluateParallel(snapshots, 2);

    expect(mockEvaluateAsset).toHaveBeenCalledTimes(4);
    mockEvaluateAsset.mockRestore();
  });

  it("respects batch size boundary", async () => {
    const evaluateAssetSpy = vi.spyOn(service, "evaluateAsset").mockResolvedValue([]);

    const snapshots: MetricSnapshot[] = Array.from({ length: 25 }, (_, i) => ({
      assetCode: `ASSET${i}`,
      metrics: { price_deviation_bps: i * 10 },
    }));

    const batchSize = 10;
    await service.batchEvaluateParallel(snapshots, batchSize);

    expect(evaluateAssetSpy).toHaveBeenCalledTimes(25);
    evaluateAssetSpy.mockRestore();
  });

  it("combines results from all batches", async () => {
    const mockEvents = [
      { eventId: "e1", assetCode: "USDC", alertType: "price_deviation" as const, priority: "high" as const, ruleId: "r1", triggeredValue: 100, threshold: 50, metric: "price", webhookDelivered: false, onChainEventId: null, lifecycleState: "open" as const, acknowledgedAt: null, acknowledgedBy: null, assignedAt: null, assignedTo: null, closedAt: null, closedBy: null, closureNote: null, updatedAt: new Date(), time: new Date() },
      { eventId: "e2", assetCode: "EURC", alertType: "price_deviation" as const, priority: "high" as const, ruleId: "r2", triggeredValue: 200, threshold: 50, metric: "price", webhookDelivered: false, onChainEventId: null, lifecycleState: "open" as const, acknowledgedAt: null, acknowledgedBy: null, assignedAt: null, assignedTo: null, closedAt: null, closedBy: null, closureNote: null, updatedAt: new Date(), time: new Date() },
    ];

    vi.spyOn(service, "evaluateAsset")
      .mockResolvedValueOnce([mockEvents[0]])
      .mockResolvedValueOnce([mockEvents[1]])
      .mockResolvedValue([]);

    const snapshots: MetricSnapshot[] = [
      { assetCode: "USDC", metrics: { price_deviation_bps: 100 } },
      { assetCode: "EURC", metrics: { price_deviation_bps: 200 } },
    ];

    const results = await service.batchEvaluateParallel(snapshots, 1);

    expect(results).toHaveLength(2);
    expect(results[0].assetCode).toBe("USDC");
    expect(results[1].assetCode).toBe("EURC");
  });

  it("handles empty snapshots array", async () => {
    const evaluateAssetSpy = vi.spyOn(service, "evaluateAsset").mockResolvedValue([]);

    const results = await service.batchEvaluateParallel([], 10);

    expect(results).toHaveLength(0);
    expect(evaluateAssetSpy).not.toHaveBeenCalled();
    evaluateAssetSpy.mockRestore();
  });

  it("continues processing if one evaluation fails", async () => {
    vi.spyOn(service, "evaluateAsset")
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("Evaluation failed"))
      .mockResolvedValueOnce([]);

    const snapshots: MetricSnapshot[] = [
      { assetCode: "USDC", metrics: { price_deviation_bps: 100 } },
      { assetCode: "EURC", metrics: { price_deviation_bps: 200 } },
      { assetCode: "USDT", metrics: { price_deviation_bps: 150 } },
    ];

    expect(
      service.batchEvaluateParallel(snapshots, 1)
    ).rejects.toThrow();
  });
});
