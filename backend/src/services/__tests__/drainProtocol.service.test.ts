import { describe, it, expect, beforeEach, vi } from "vitest";
import { DrainProtocolService } from "../drainProtocol.service.js";

vi.mock("../database/connection.js", () => {
  const mockDb: any = vi.fn().mockImplementation(() => mockDb);
  mockDb.schema = {
    hasTable: vi.fn().mockResolvedValue(true),
  };
  mockDb.where = vi.fn().mockReturnValue(mockDb);
  mockDb.update = vi.fn().mockResolvedValue([1]);
  mockDb.insert = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([{ id: "test-session-uuid-1234" }]),
  });
  mockDb.select = vi.fn().mockReturnValue(mockDb);
  mockDb.orderBy = vi.fn().mockReturnValue(mockDb);
  mockDb.limit = vi.fn().mockResolvedValue([]);
  return { getDatabase: () => mockDb };
});

vi.mock("../api/websocket/websocket.server.js", () => ({
  wsServer: {
    shutdown: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../workers/queue.js", () => ({
  JobQueue: {
    getInstance: () => ({
      stop: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

vi.mock("../jobs/supplyVerification.job.js", () => ({
  getSupplyVerificationQueue: () => ({
    stop: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("../workers/webhookDelivery.worker.js", () => ({
  stopWebhookWorker: vi.fn().mockResolvedValue(undefined),
}));

describe("DrainProtocolService", () => {
  let service: DrainProtocolService;

  beforeEach(() => {
    service = new DrainProtocolService();
    vi.clearAllMocks();
  });

  it("initializes with ACTIVE state and 0 in-flight requests", () => {
    expect(service.getState()).toBe("ACTIVE");
    expect(service.isDraining()).toBe(false);
    expect(service.getInFlightCount()).toBe(0);
  });

  it("increments and decrements in-flight requests accurately", () => {
    service.incrementInFlight();
    service.incrementInFlight();
    expect(service.getInFlightCount()).toBe(2);

    service.decrementInFlight();
    expect(service.getInFlightCount()).toBe(1);

    service.decrementInFlight();
    expect(service.getInFlightCount()).toBe(0);

    // Prevents negative counter
    service.decrementInFlight();
    expect(service.getInFlightCount()).toBe(0);
  });

  it("transitions state to DRAINING and completes immediately when no in-flight requests exist", async () => {
    const status = await service.startDrain({
      reason: "Maintenance test",
      initiatedBy: "operator",
      timeoutSeconds: 10,
    });

    expect(status.state).toBe("DRAINED");
    expect(status.reason).toBe("Maintenance test");
    expect(status.initiatedBy).toBe("operator");
    expect(service.isDraining()).toBe(true);
  });

  it("allows cancelling active or completed drain session and resets to ACTIVE", async () => {
    await service.startDrain({ reason: "Cancel test" });
    const cancelledStatus = await service.cancelDrain("operator-admin");

    expect(service.getState()).toBe("ACTIVE");
    expect(service.isDraining()).toBe(false);
    expect(cancelledStatus.state).toBe("ACTIVE");
  });

  it("supports force shutdown execution", async () => {
    await service.startDrain({ reason: "Force test" });
    const forcedStatus = await service.forceShutdown("Emergency stop");

    expect(forcedStatus.state).toBe("FAILED");
  });
});
