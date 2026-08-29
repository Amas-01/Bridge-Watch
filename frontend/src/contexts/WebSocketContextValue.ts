import { createContext, useContext } from "react";
import type { ConnectionState } from "../types";

export interface WebSocketContextValue {
  /** Current connection state */
  connectionState: ConnectionState;
  /** True when WebSocket is unavailable and callers should poll instead */
  isPollingFallback: boolean;
  /**
   * Send a message. Queued automatically when the connection is not open
   * and flushed once reconnected.
   */
  send: (data: unknown) => void;
  /**
   * Subscribe to a channel. Returns an unsubscribe function.
   * Safe to call before the connection is open — the subscription is
   * replayed to the server on every (re)connect.
   */
  subscribe: (channel: string, handler: (data: unknown) => void) => () => void;
}

export const WebSocketContext = createContext<WebSocketContextValue | null>(null);

/** Must be used inside <WebSocketProvider>. */
export function useWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    throw new Error(
      "useWebSocketContext must be called inside <WebSocketProvider>"
    );
  }
  return ctx;
}
