import { describe, it, expect, beforeEach } from "vitest";
import {
  useWebSocketStore,
  selectWebSocketStatus,
  selectIsConnected,
  selectActiveChannels,
  selectLastMessage,
  selectMessagesByChannel,
  selectConnectionStats,
} from "./webSocketStore";

function resetStoreState() {
  const initialState = useWebSocketStore.getInitialState();
  useWebSocketStore.setState(initialState, true);
}

describe("webSocketStore", () => {
  beforeEach(() => {
    resetStoreState();
  });

  it("initializes with default WebSocket state", () => {
    const state = useWebSocketStore.getState();

    expect(state.status).toBe("disconnected");
    expect(state.url).toBeNull();
    expect(state.lastConnectedAt).toBeNull();
    expect(state.lastDisconnectedAt).toBeNull();
    expect(state.reconnectAttempts).toBe(0);
    expect(state.maxReconnectAttempts).toBe(5);
    expect(state.activeChannels).toEqual(new Set());
    expect(state.pendingSubscriptions).toEqual(new Set());
    expect(state.messageHistory).toEqual([]);
    expect(state.lastMessage).toBeNull();
    expect(state.messageCount).toBe(0);
    expect(state.errors).toEqual([]);
    expect(state.lastError).toBeNull();
  });

  describe("connection actions", () => {
    it("sets connection status", () => {
      useWebSocketStore.getState().setStatus("connecting");
      expect(useWebSocketStore.getState().status).toBe("connecting");

      useWebSocketStore.getState().setStatus("connected");
      expect(useWebSocketStore.getState().status).toBe("connected");

      useWebSocketStore.getState().setStatus("error");
      expect(useWebSocketStore.getState().status).toBe("error");
    });

    it("sets the WebSocket URL", () => {
      useWebSocketStore.getState().setUrl("wss://example.com/ws");

      expect(useWebSocketStore.getState().url).toBe("wss://example.com/ws");
    });

    it("marks as connected and resets reconnect attempts", () => {
      useWebSocketStore.getState().incrementReconnectAttempts();
      useWebSocketStore.getState().incrementReconnectAttempts();

      useWebSocketStore.getState().markConnected();

      const state = useWebSocketStore.getState();
      expect(state.status).toBe("connected");
      expect(state.reconnectAttempts).toBe(0);
      expect(state.lastConnectedAt).toBeGreaterThan(0);
    });

    it("marks as disconnected", () => {
      useWebSocketStore.getState().markConnected();
      useWebSocketStore.getState().markDisconnected();

      const state = useWebSocketStore.getState();
      expect(state.status).toBe("disconnected");
      expect(state.lastDisconnectedAt).toBeGreaterThan(0);
    });

    it("increments reconnect attempts", () => {
      useWebSocketStore.getState().incrementReconnectAttempts();
      expect(useWebSocketStore.getState().reconnectAttempts).toBe(1);

      useWebSocketStore.getState().incrementReconnectAttempts();
      expect(useWebSocketStore.getState().reconnectAttempts).toBe(2);
    });

    it("resets reconnect attempts to zero", () => {
      useWebSocketStore.getState().incrementReconnectAttempts();
      useWebSocketStore.getState().incrementReconnectAttempts();
      useWebSocketStore.getState().resetReconnectAttempts();

      expect(useWebSocketStore.getState().reconnectAttempts).toBe(0);
    });

    it("sets max reconnect attempts", () => {
      useWebSocketStore.getState().setMaxReconnectAttempts(10);
      expect(useWebSocketStore.getState().maxReconnectAttempts).toBe(10);

      useWebSocketStore.getState().setMaxReconnectAttempts(3);
      expect(useWebSocketStore.getState().maxReconnectAttempts).toBe(3);
    });
  });

  describe("subscription actions", () => {
    it("subscribes to a channel (adds to pending)", () => {
      useWebSocketStore.getState().subscribe("trades");

      const state = useWebSocketStore.getState();
      expect(state.pendingSubscriptions.has("trades")).toBe(true);
      expect(state.activeChannels.has("trades")).toBe(false);
    });

    it("does not duplicate a pending subscription for an already subscribed channel", () => {
      useWebSocketStore.getState().subscribe("trades");
      useWebSocketStore.getState().confirmSubscription("trades");

      useWebSocketStore.getState().subscribe("trades");

      const state = useWebSocketStore.getState();
      expect(state.pendingSubscriptions.has("trades")).toBe(false);
      expect(state.activeChannels.has("trades")).toBe(true);
    });

    it("unsubscribes from an active channel", () => {
      useWebSocketStore.getState().subscribe("trades");
      useWebSocketStore.getState().confirmSubscription("trades");
      useWebSocketStore.getState().unsubscribe("trades");

      const state = useWebSocketStore.getState();
      expect(state.activeChannels.has("trades")).toBe(false);
    });

    it("unsubscribes from a pending channel", () => {
      useWebSocketStore.getState().subscribe("trades");
      useWebSocketStore.getState().unsubscribe("trades");

      const state = useWebSocketStore.getState();
      expect(state.pendingSubscriptions.has("trades")).toBe(false);
      expect(state.activeChannels.has("trades")).toBe(false);
    });

    it("unsubscribing a non-subscribed channel does nothing", () => {
      useWebSocketStore.getState().unsubscribe("nonexistent");

      const state = useWebSocketStore.getState();
      expect(state.activeChannels.size).toBe(0);
      expect(state.pendingSubscriptions.size).toBe(0);
    });

    it("confirms a pending subscription (moves to active)", () => {
      useWebSocketStore.getState().subscribe("trades");
      useWebSocketStore.getState().confirmSubscription("trades");

      const state = useWebSocketStore.getState();
      expect(state.activeChannels.has("trades")).toBe(true);
      expect(state.pendingSubscriptions.has("trades")).toBe(false);
    });

    it("confirming a non-pending subscription still adds it to active", () => {
      useWebSocketStore.getState().confirmSubscription("orders");

      expect(useWebSocketStore.getState().activeChannels.has("orders")).toBe(true);
    });

    it("clears all pending subscriptions", () => {
      useWebSocketStore.getState().subscribe("trades");
      useWebSocketStore.getState().subscribe("orders");
      useWebSocketStore.getState().clearPendingSubscriptions();

      expect(useWebSocketStore.getState().pendingSubscriptions.size).toBe(0);
    });

    it("isSubscribed returns true for active channels", () => {
      useWebSocketStore.getState().subscribe("trades");
      useWebSocketStore.getState().confirmSubscription("trades");

      expect(useWebSocketStore.getState().isSubscribed("trades")).toBe(true);
    });

    it("isSubscribed returns false for non-subscribed channels", () => {
      expect(useWebSocketStore.getState().isSubscribed("trades")).toBe(false);
    });

    it("handles multiple subscriptions", () => {
      useWebSocketStore.getState().subscribe("trades");
      useWebSocketStore.getState().subscribe("orders");
      useWebSocketStore.getState().confirmSubscription("trades");
      useWebSocketStore.getState().confirmSubscription("orders");

      const state = useWebSocketStore.getState();
      expect(state.activeChannels.size).toBe(2);
      expect(state.pendingSubscriptions.size).toBe(0);
    });
  });

  describe("message actions", () => {
    it("adds a message and updates lastMessage and count", () => {
      useWebSocketStore.getState().addMessage("trades", { price: 100 });

      const state = useWebSocketStore.getState();
      expect(state.messageCount).toBe(1);
      expect(state.messageHistory).toHaveLength(1);
      expect(state.lastMessage).not.toBeNull();
      expect(state.lastMessage!.channel).toBe("trades");
      expect(state.lastMessage!.data).toEqual({ price: 100 });
      expect(state.lastMessage!.id).toMatch(/^msg-/);
    });

    it("adds multiple messages in order", () => {
      useWebSocketStore.getState().addMessage("trades", { seq: 1 });
      useWebSocketStore.getState().addMessage("orders", { seq: 2 });
      useWebSocketStore.getState().addMessage("trades", { seq: 3 });

      const state = useWebSocketStore.getState();
      expect(state.messageCount).toBe(3);
      expect(state.messageHistory).toHaveLength(3);
      expect(state.messageHistory[0].data).toEqual({ seq: 3 });
      expect(state.lastMessage!.data).toEqual({ seq: 3 });
    });

    it("clears message history and resets count", () => {
      useWebSocketStore.getState().addMessage("trades", { price: 100 });
      useWebSocketStore.getState().addMessage("orders", { qty: 5 });

      useWebSocketStore.getState().clearMessageHistory();

      const state = useWebSocketStore.getState();
      expect(state.messageHistory).toEqual([]);
      expect(state.messageCount).toBe(0);
    });

    it("sets lastMessage to null", () => {
      useWebSocketStore.getState().addMessage("trades", { price: 100 });

      useWebSocketStore.getState().setLastMessage(null);

      expect(useWebSocketStore.getState().lastMessage).toBeNull();
    });
  });

  describe("error actions", () => {
    it("adds an error and sets lastError", () => {
      useWebSocketStore.getState().addError(1000, "Connection closed");

      const state = useWebSocketStore.getState();
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0].code).toBe(1000);
      expect(state.errors[0].message).toBe("Connection closed");
      expect(state.lastError).not.toBeNull();
      expect(state.lastError!.code).toBe(1000);
    });

    it("adds multiple errors in order", () => {
      useWebSocketStore.getState().addError(1000, "First");
      useWebSocketStore.getState().addError(1001, "Second");

      const state = useWebSocketStore.getState();
      expect(state.errors).toHaveLength(2);
      expect(state.errors[0].message).toBe("Second");
      expect(state.errors[1].message).toBe("First");
    });

    it("clears all errors", () => {
      useWebSocketStore.getState().addError(1000, "Error 1");
      useWebSocketStore.getState().addError(1001, "Error 2");

      useWebSocketStore.getState().clearErrors();

      const state = useWebSocketStore.getState();
      expect(state.errors).toEqual([]);
      expect(state.lastError).toBeNull();
    });
  });

  describe("reset", () => {
    it("resets all WebSocket state to initial values", () => {
      const store = useWebSocketStore.getState();
      store.setStatus("connected");
      store.setUrl("wss://example.com/ws");
      store.incrementReconnectAttempts();
      store.addMessage("trades", { price: 100 });
      store.addError(1000, "Error");

      useWebSocketStore.getState().reset();

      const state = useWebSocketStore.getState();
      expect(state.status).toBe("disconnected");
      expect(state.url).toBeNull();
      expect(state.lastConnectedAt).toBeNull();
      expect(state.lastDisconnectedAt).toBeNull();
      expect(state.reconnectAttempts).toBe(0);
      expect(state.maxReconnectAttempts).toBe(5);
      expect(state.activeChannels).toEqual(new Set());
      expect(state.pendingSubscriptions).toEqual(new Set());
      expect(state.messageHistory).toEqual([]);
      expect(state.lastMessage).toBeNull();
      expect(state.messageCount).toBe(0);
      expect(state.errors).toEqual([]);
      expect(state.lastError).toBeNull();
    });
  });

  describe("selectors", () => {
    it("selectWebSocketStatus returns the status", () => {
      useWebSocketStore.getState().setStatus("connecting");
      expect(selectWebSocketStatus(useWebSocketStore.getState())).toBe("connecting");
    });

    it("selectIsConnected returns true when connected", () => {
      useWebSocketStore.getState().setStatus("connected");
      expect(selectIsConnected(useWebSocketStore.getState())).toBe(true);
    });

    it("selectIsConnected returns false when not connected", () => {
      expect(selectIsConnected(useWebSocketStore.getState())).toBe(false);

      useWebSocketStore.getState().setStatus("reconnecting");
      expect(selectIsConnected(useWebSocketStore.getState())).toBe(false);
    });

    it("selectActiveChannels returns channel names as an array", () => {
      useWebSocketStore.getState().subscribe("trades");
      useWebSocketStore.getState().confirmSubscription("trades");

      const channels = selectActiveChannels(useWebSocketStore.getState());
      expect(channels).toEqual(["trades"]);
    });

    it("selectLastMessage returns the last message", () => {
      useWebSocketStore.getState().addMessage("trades", { price: 100 });
      const message = selectLastMessage(useWebSocketStore.getState());
      expect(message).not.toBeNull();
      expect(message!.channel).toBe("trades");
    });

    it("selectLastMessage returns null when no messages", () => {
      expect(selectLastMessage(useWebSocketStore.getState())).toBeNull();
    });

    it("selectMessagesByChannel filters messages by channel", () => {
      useWebSocketStore.getState().addMessage("trades", { seq: 1 });
      useWebSocketStore.getState().addMessage("orders", { seq: 2 });

      const tradeMessages = selectMessagesByChannel(useWebSocketStore.getState(), "trades");
      expect(tradeMessages).toHaveLength(1);
      expect(tradeMessages[0].data).toEqual({ seq: 1 });
    });

    it("selectMessagesByChannel returns empty array for no-match channel", () => {
      useWebSocketStore.getState().addMessage("trades", { seq: 1 });

      const result = selectMessagesByChannel(useWebSocketStore.getState(), "nonexistent");
      expect(result).toEqual([]);
    });

    it("selectConnectionStats returns aggregated stats", () => {
      useWebSocketStore.getState().setStatus("connected");
      useWebSocketStore.getState().setMaxReconnectAttempts(10);
      useWebSocketStore.getState().subscribe("trades");
      useWebSocketStore.getState().confirmSubscription("trades");
      useWebSocketStore.getState().addMessage("trades", { price: 100 });

      const stats = selectConnectionStats(useWebSocketStore.getState());
      expect(stats.status).toBe("connected");
      expect(stats.activeChannelsCount).toBe(1);
      expect(stats.messageCount).toBe(1);
      expect(stats.maxReconnectAttempts).toBe(10);
    });
  });
});
