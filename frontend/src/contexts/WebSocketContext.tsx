import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { wsService } from "../services/websocket";
import { WebSocketContext } from "./WebSocketContextValue";
import type { ConnectionState } from "../types";

const WS_URL = `ws://${window.location.hostname}:3002/api/v1/ws`;

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");
  const connectedRef = useRef(false);

  useEffect(() => {
    // Initiate a single connection for the whole app lifetime
    if (!connectedRef.current) {
      connectedRef.current = true;
      wsService.connect(WS_URL);
    }

    const unsub = wsService.onStateChange(setConnectionState);

    // Listen for network connectivity changes
    const handleOnline = () => {
      wsService.connect(WS_URL);
    };

    window.addEventListener("online", handleOnline);
    return () => {
      unsub();
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const send = useCallback((data: unknown) => {
    wsService.send(data);
  }, []);

  const subscribe = useCallback(
    (channel: string, handler: (data: unknown) => void) =>
      wsService.subscribe(channel, handler),
    []
  );

  return (
    <WebSocketContext.Provider
      value={{
        connectionState,
        isPollingFallback: wsService.isPollingFallback,
        send,
        subscribe,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
}


