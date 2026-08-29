import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebsocketService } from "../../src/services/websocket.js";

function createSocket() {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  return {
    send: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      listeners[event] = cb;
    }),
    _emit: (event: string, ...args: unknown[]) => {
      listeners[event]?.(...args);
    },
  };
}

describe("WebsocketService", () => {
  let service: WebsocketService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = WebsocketService.getInstance();
    const anyService = service as any;
    anyService.clients = new Map();
    anyService.topicSubscribers = new Map();
    anyService.history = new Map();
    anyService.sequenceCounter = 0;
    anyService.replayMetrics = {
      totalExpired: 0,
      replayRequests: 0,
      replayMessagesDelivered: 0,
    };
    anyService.queue = [];
    if (anyService.heartbeatTimer !== null) {
      clearInterval(anyService.heartbeatTimer);
      anyService.heartbeatTimer = null;
    }
  });

  afterEach(() => {
    const anyService = service as any;
    if (anyService.heartbeatTimer !== null) {
      clearInterval(anyService.heartbeatTimer);
      anyService.heartbeatTimer = null;
    }
    vi.useRealTimers();
  });

  it("should register a client and deliver a subscribed price update", () => {
    const socket = createSocket();
    const clientId = service.addClient(socket);

    service.subscribe(clientId, "prices", { symbol: "USDC" });
    service.publish("price_update", "prices:USDC", { symbol: "USDC", price: 1.0 }, { priority: "high" });

    expect(socket.send).toHaveBeenCalled();
    const payloads = socket.send.mock.calls.map((call) => JSON.parse(call[0] as string));
    const batchPayload = payloads.find((payload) => payload.type === "batch");

    expect(batchPayload).toBeDefined();
    expect(batchPayload.messages).toHaveLength(1);
    expect(batchPayload.messages[0].type).toBe("price_update");
    expect(batchPayload.messages[0].topic).toBe("prices:USDC");
    expect(batchPayload.messages[0].sequence).toBe(1);
  });

  it("should replay messages by topic and sequence", () => {
    service.publish("price_update", "prices:USDC", { symbol: "USDC", price: 1.0 });
    service.publish("price_update", "prices:EURC", { symbol: "EURC", price: 1.1 });
    service.publish("transaction_update", "bridge.main", { event: "created" });

    const replay = service.getReplayMessages(["prices"], { sinceSequence: 1, limit: 5 });

    expect(replay).toHaveLength(1);
    expect(replay[0].topic).toBe("prices:EURC");
    expect(replay[0].sequence).toBe(2);
  });

  it("should expire old replay messages and expose replay metrics", () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValue(1_000);
    service.publish(
      "price_update",
      "prices:USDC",
      { symbol: "USDC", price: 1.0 },
      { timestamp: new Date(1_000).toISOString() },
    );

    nowSpy.mockReturnValue(1_000 + 5 * 60 * 1000 + 10);
    const replay = service.getReplayMessages(["prices:USDC"], { limit: 5 });
    const metrics = service.getReplayMetrics();

    expect(replay).toHaveLength(0);
    expect(metrics.totalExpired).toBeGreaterThanOrEqual(1);
    expect(metrics.replayRequests).toBeGreaterThanOrEqual(1);

    nowSpy.mockRestore();
  });

  describe("heartbeat timeout", () => {
    it("should remove stale clients after heartbeat sweep", () => {
      const socket = createSocket();
      const clientId = service.addClient(socket);
      service.subscribe(clientId, "prices");

      // Simulate the client going silent: set lastSeen far in the past
      const anyService = service as any;
      const client = anyService.clients.get(clientId);
      client.lastSeen = Date.now() - 60_000;

      // Trigger the heartbeat sweep
      (service as any).startHeartbeat();
      vi.advanceTimersByTime(30_000);

      expect(anyService.clients.has(clientId)).toBe(false);
      expect(anyService.topicSubscribers.get("prices")).toBeUndefined();
    });

    it("should keep active clients that respond within the window", () => {
      const socket = createSocket();
      const clientId = service.addClient(socket);
      service.subscribe(clientId, "prices");

      const anyService = service as any;
      const client = anyService.clients.get(clientId);
      client.lastSeen = Date.now();

      (service as any).startHeartbeat();
      vi.advanceTimersByTime(30_000);

      expect(anyService.clients.has(clientId)).toBe(true);
    });

    it("should clean up topic subscribers when client is removed", () => {
      const socket1 = createSocket();
      const socket2 = createSocket();
      const id1 = service.addClient(socket1);
      const id2 = service.addClient(socket2);

      service.subscribe(id1, "alerts");
      service.subscribe(id2, "alerts");

      const anyService = service as any;
      const client1 = anyService.clients.get(id1);
      client1.lastSeen = Date.now() - 60_000;

      (service as any).startHeartbeat();
      vi.advanceTimersByTime(30_000);

      expect(anyService.clients.has(id1)).toBe(false);
      expect(anyService.clients.has(id2)).toBe(true);
      expect(anyService.topicSubscribers.get("alerts")?.has(id2)).toBe(true);
    });
  });

  describe("removeClient", () => {
    it("should clean up subscriptions when client is removed", () => {
      const socket = createSocket();
      const clientId = service.addClient(socket);
      service.subscribe(clientId, "prices");
      service.subscribe(clientId, "alerts");

      service.removeClient(clientId);

      const anyService = service as any;
      expect(anyService.topicSubscribers.get("prices")?.has(clientId) ?? false).toBe(false);
      expect(anyService.topicSubscribers.get("alerts")?.has(clientId) ?? false).toBe(false);
    });

    it("should not reset lastSeen so heartbeat can still detect stale clients", () => {
      const socket = createSocket();
      const clientId = service.addClient(socket);
      const anyService = service as any;
      const client = anyService.clients.get(clientId);
      const originalLastSeen = client.lastSeen;

      service.removeClient(clientId);

      expect(client.lastSeen).toBe(originalLastSeen);
      expect(client.presence).toBe("offline");
      expect(anyService.clients.has(clientId)).toBe(true);
    });

    it("should terminate stale offline client after heartbeat sweep", () => {
      const socket = createSocket();
      const clientId = service.addClient(socket);
      service.subscribe(clientId, "prices");

      const anyService = service as any;
      const client = anyService.clients.get(clientId);

      service.removeClient(clientId);
      client.lastSeen = Date.now() - 60_000;

      (service as any).startHeartbeat();
      vi.advanceTimersByTime(30_000);

      expect(anyService.clients.has(clientId)).toBe(false);
    });
  });

  describe("pong handling", () => {
    it("should update lastSeen and clear pendingPing on pong", () => {
      const socket = createSocket();
      const clientId = service.addClient(socket);
      const anyService = service as any;
      const client = anyService.clients.get(clientId);

      client.pendingPing = true;
      client.lastSeen = Date.now() - 30_000;

      socket._emit("pong");

      expect(client.pendingPing).toBe(false);
      expect(client.lastSeen).toBe(Date.now());
    });

    it("should terminate client that misses pong response", () => {
      const socket = createSocket();
      const clientId = service.addClient(socket);
      service.subscribe(clientId, "prices");

      const anyService = service as any;
      const client = anyService.clients.get(clientId);

      client.lastSeen = Date.now();
      client.pendingPing = true;

      (service as any).startHeartbeat();
      vi.advanceTimersByTime(30_000);

      expect(anyService.clients.has(clientId)).toBe(false);
      expect(socket.terminate).toHaveBeenCalled();
    });
  });

  describe("close handling", () => {
    it("should call removeClient when socket closes", () => {
      const socket = createSocket();
      const clientId = service.addClient(socket);
      service.subscribe(clientId, "prices");

      socket._emit("close");

      const anyService = service as any;
      const client = anyService.clients.get(clientId);
      expect(client.presence).toBe("offline");
      expect(client.socket).toBeUndefined();
    });
  });

  describe("resume", () => {
    it("should register pong and close handlers on resumed socket", () => {
      const socket1 = createSocket();
      const clientId = service.addClient(socket1);

      const socket2 = createSocket();
      const resumedId = service.addClient(socket2, clientId);

      expect(resumedId).toBe(clientId);
      expect(socket2.on).toHaveBeenCalledWith("pong", expect.any(Function));
      expect(socket2.on).toHaveBeenCalledWith("close", expect.any(Function));

      socket2._emit("close");

      const anyService = service as any;
      const client = anyService.clients.get(clientId);
      expect(client.presence).toBe("offline");
    });
  });
});
