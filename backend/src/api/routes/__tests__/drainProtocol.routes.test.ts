import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify from "fastify";
import { drainProtocolRoutes } from "../drainProtocol.routes.js";
import { drainProtocolService } from "../../../services/drainProtocol.service.js";

vi.mock("../../../services/drainProtocol.service.js", () => {
  const mockStatus = {
    sessionId: "mock-session-id",
    nodeId: "node-1",
    state: "ACTIVE",
    drainMode: "graceful",
    inFlightRequests: 0,
    activeConnections: 0,
    activeStreams: 0,
    startedAt: null,
    drainedAt: null,
    reason: null,
    initiatedBy: null,
    timeoutSeconds: 30,
  };

  return {
    drainProtocolService: {
      getStatus: vi.fn().mockImplementation(() => mockStatus),
      startDrain: vi.fn().mockImplementation(async (opts) => ({
        ...mockStatus,
        state: "DRAINED",
        reason: opts?.reason || "Graceful drain",
        initiatedBy: opts?.initiatedBy || "admin",
      })),
      cancelDrain: vi.fn().mockImplementation(async (by) => ({
        ...mockStatus,
        state: "ACTIVE",
        initiatedBy: by,
      })),
      forceShutdown: vi.fn().mockImplementation(async (reason) => ({
        ...mockStatus,
        state: "FAILED",
        reason,
      })),
      getDrainHistory: vi.fn().mockResolvedValue([mockStatus]),
    },
  };
});

vi.mock("../../middleware/auth.js", () => ({
  authMiddleware: () => async () => {},
}));

describe("drainProtocolRoutes", () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    app = Fastify();
    await app.register(drainProtocolRoutes);
    vi.clearAllMocks();
  });

  it("GET /status returns current drain status", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/status",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.nodeId).toBe("node-1");
    expect(body.state).toBe("ACTIVE");
  });

  it("POST /start initiates drain and returns HTTP 202 Accepted", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/start",
      payload: {
        timeoutSeconds: 15,
        reason: "Maintenance shutdown",
      },
    });

    expect(res.statusCode).toBe(202);
    expect(drainProtocolService.startDrain).toHaveBeenCalledWith(
      expect.objectContaining({
        timeoutSeconds: 15,
        reason: "Maintenance shutdown",
      })
    );
  });

  it("POST /cancel cancels active drain protocol", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/cancel",
      payload: { cancelledBy: "operator-admin" },
    });

    expect(res.statusCode).toBe(200);
    expect(drainProtocolService.cancelDrain).toHaveBeenCalledWith("operator-admin");
  });

  it("POST /force triggers force shutdown", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/force",
      payload: { reason: "Urgent abort" },
    });

    expect(res.statusCode).toBe(200);
    expect(drainProtocolService.forceShutdown).toHaveBeenCalledWith("Urgent abort");
  });

  it("GET /history returns past drain sessions", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/history?limit=5",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.history).toHaveLength(1);
    expect(body.count).toBe(1);
  });
});
