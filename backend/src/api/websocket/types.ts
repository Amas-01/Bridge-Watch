/**
 * TypeScript types for all WebSocket message formats.
 *
 * Message flow overview:
 *   Client  →  Server : InboundMessage  (subscribe / unsubscribe / ping)
 *   Server  →  Client : OutboundMessage (ack / data updates / errors)
 *
 * Available channels:
 *   prices  – aggregated VWAP prices for all supported Stellar assets  (public)
 *   health  – composite health scores per asset                        (public)
 *   bridges – bridge status and TVL updates                            (public)
 *   alerts  – real-time alert events                                   (private, auth required)
 */

// ─── Minimal WebSocket interface ──────────────────────────────────────────────

/**
 * Minimal surface of a `ws.WebSocket` that this module needs.
 * Using an interface instead of importing from `ws` avoids a transitive
 * dependency appearing in the project's own package.json.
 */
export interface WsSocket {
  readyState: number;
  send(data: string, cb?: (err?: Error) => void): void;
  ping(data?: Buffer): void;
  terminate(): void;
  close(code?: number, reason?: string): void;
  on(event: "message", cb: (data: Buffer) => void): this;
  on(event: "pong", cb: () => void): this;
  on(event: "close", cb: () => void): this;
  on(event: "error", cb: (err: Error) => void): this;
}

// ─── Channel definition ────────────────────────────────────────────────────────

/** Names of all available subscription channels. */
export type ChannelName = "prices" | "health" | "alerts" | "bridges" | "events";

/** Channels that require a valid auth token to subscribe. */
export const PRIVATE_CHANNELS = new Set<ChannelName>(["alerts"]);

/** All channel names in a stable array for enumeration. */
export const ALL_CHANNELS: ChannelName[] = [
  "prices",
  "health",
  "alerts",
  "bridges",
  "events",
];

// ─── Broadcaster interface (breaks circular dep with channels) ─────────────────

/**
 * Minimal interface that channels need from the WebSocketServer.
 * Using an interface here breaks the circular import between
 * `websocket.server.ts` and `channels/index.ts`.
 */
export interface IBroadcaster {
  broadcastToChannel(
    channel: ChannelName,
    message: OutboundDataMessage
  ): Promise<void>;
  /**
   * Send a message to a single specific client by ID.
   * No-ops silently when the client is not found or the socket is closed.
   */
  sendToClient(clientId: string, message: OutboundDataMessage): void;
}

// ─── Inbound messages (Client → Server) ───────────────────────────────────────

export interface ClientSubscribeMessage {
  type: "subscribe";
  /** Channel to subscribe to. */
  channel: ChannelName;
  /**
   * Bearer token required when subscribing to private channels (e.g. "alerts").
   * Can also be passed as the `?token=` query parameter on the WS URL.
   */
  token?: string;
  /** Optional channel-specific filter params (reserved for future use). */
  params?: {
    symbols?: string[];
    assetCode?: string;
  };
  /**
   * Snapshot catch-up: the WS sequence number the client last observed (from
   * the `X-Snapshot-Token` header of a prior REST response).  When provided,
   * the server replays all buffered events after this boundary or sends a
   * `snapshot_required` message if the buffer does not reach that far back.
   */
  sinceSequence?: number;
  /**
   * The opaque snapshot token from `X-Snapshot-Token` on a prior REST
   * response.  The server decodes it to derive `sinceSequence` when
   * `sinceSequence` is not provided directly.
   */
  snapshotToken?: string;
}

export interface ClientUnsubscribeMessage {
  type: "unsubscribe";
  channel: ChannelName;
}

export interface ClientPingMessage {
  type: "ping";
}

export type InboundMessage =
  | ClientSubscribeMessage
  | ClientUnsubscribeMessage
  | ClientPingMessage;

// ─── Outbound messages (Server → Client) ──────────────────────────────────────

/** Sent immediately after a connection is established. */
export interface WelcomeMessage {
  type: "welcome";
  clientId: string;
  /** All channel names the server exposes. */
  channels: ChannelName[];
  timestamp: string;
}

export interface SubscribedAck {
  type: "subscribed";
  channel: ChannelName;
  timestamp: string;
}

export interface UnsubscribedAck {
  type: "unsubscribed";
  channel: ChannelName;
  timestamp: string;
}

export interface PongMessage {
  type: "pong";
  timestamp: string;
}

/** Numeric codes embedded in {@link WsErrorMessage}. */
export const WsErrorCode = {
  /** Payload was not valid JSON. */
  INVALID_JSON: 4000,
  /** Message structure did not match any known inbound message type. */
  INVALID_MESSAGE: 4001,
  /** Missing or invalid auth token for a private channel. */
  UNAUTHORIZED: 4003,
  /** Requested channel does not exist. */
  UNKNOWN_CHANNEL: 4004,
  /** Client has exceeded the per-window message rate limit. */
  RATE_LIMITED: 4029,
} as const;

export type WsErrorCodeValue = (typeof WsErrorCode)[keyof typeof WsErrorCode];

export interface WsErrorMessage {
  type: "error";
  message: string;
  code: WsErrorCodeValue;
  timestamp: string;
}

// ─── Data payload types ───────────────────────────────────────────────────────

export interface PriceSource {
  source: string;
  price: number;
  timestamp: string;
}

export interface PriceData {
  symbol: string;
  /** Best available single price (same as vwap when only one source). */
  price: number;
  /** Volume-weighted average price across all active sources. */
  vwap: number;
  /** Relative deviation between sources (0 = perfectly aligned). */
  deviation: number;
  sources: PriceSource[];
  timestamp: string;
}

export interface PriceUpdateMessage {
  type: "price_update";
  channel: "prices";
  data: PriceData[];
  timestamp: string;
}

export interface HealthFactors {
  liquidityDepth: number;
  priceStability: number;
  bridgeUptime: number;
  reserveBacking: number;
  volumeTrend: number;
}

export interface HealthData {
  symbol: string;
  /** Composite score 0–100. */
  overallScore: number;
  factors: HealthFactors;
  trend: "improving" | "stable" | "deteriorating";
  timestamp: string;
}

export interface HealthUpdateMessage {
  type: "health_update";
  channel: "health";
  data: HealthData[];
  timestamp: string;
}

export interface AlertData {
  ruleId: string;
  assetCode: string;
  alertType: string;
  priority: "critical" | "high" | "medium" | "low";
  triggeredValue: number;
  threshold: number;
  metric: string;
  timestamp: string;
}

export interface AlertTriggeredMessage {
  type: "alert_triggered";
  channel: "alerts";
  data: AlertData;
  timestamp: string;
}

export interface BridgeData {
  name: string;
  status: "healthy" | "degraded" | "down";
  totalValueLocked: number;
  supplyOnStellar: number;
  supplyOnSource: number;
  mismatchPercentage: number;
  lastChecked: string;
}

export interface BridgeUpdateMessage {
  type: "bridge_update";
  channel: "bridges";
  data: BridgeData[];
  timestamp: string;
}

export interface WebhookSystemEventData {
  event: "circuit_breaker_tripped" | "circuit_breaker_reset";
  webhookEndpointId: string;
  endpointName: string;
  endpointUrl: string;
  ownerAddress: string;
  consecutiveFailures?: number;
  threshold?: number;
}

export interface WebhookSystemEventMessage {
  type: "webhook_system_event";
  channel: "events";
  data: WebhookSystemEventData;
  timestamp: string;
}

export type OutboundDataMessage =
  | PriceUpdateMessage
  | HealthUpdateMessage
  | AlertTriggeredMessage
  | BridgeUpdateMessage
  | WebhookSystemEventMessage;

// ─── Snapshot-consistency outbound messages ────────────────────────────────────

/**
 * Sent when the client requested catch-up via `sinceSequence` / `snapshotToken`
 * but the WS replay buffer does not reach far enough back to fill the gap.
 * The client must perform a fresh REST snapshot request.
 */
export interface SnapshotRequiredMessage {
  type: "snapshot_required";
  channel: ChannelName;
  /** The sequence boundary the client requested. */
  requestedSinceSequence: number;
  /** The earliest sequence currently in the replay buffer. */
  bufferLowSequence: number;
  /** Human-readable explanation. */
  reason: string;
  timestamp: string;
}

/**
 * Sent after the server has delivered all buffered replay events for a channel.
 * Signals to the client that it is now fully caught up and live events follow.
 */
export interface ReplayCompleteMessage {
  type: "replay_complete";
  channel: ChannelName;
  /** Sequence boundary the replay started from. */
  fromSequence: number;
  /** High-watermark at the time replay was served. */
  toSequence: number;
  /** Number of replay events delivered. */
  count: number;
  timestamp: string;
}

export type OutboundMessage =
  | WelcomeMessage
  | SubscribedAck
  | UnsubscribedAck
  | PongMessage
  | WsErrorMessage
  | SnapshotRequiredMessage
  | ReplayCompleteMessage
  | OutboundDataMessage;

// ─── Client state ─────────────────────────────────────────────────────────────

/** Runtime state maintained for each connected WebSocket client. */
export interface ClientState {
  /** Unique UUID assigned at connection time. */
  id: string;
  socket: WsSocket;
  /** Channels this client is actively subscribed to. */
  subscriptions: Set<ChannelName>;
  /**
   * True when the client provided a valid token (either in the WS URL
   * query-string or in a subscribe message for a private channel).
   */
  isAuthenticated: boolean;
  connectedAt: Date;
  /** Updated on every inbound message and on pong frames (heartbeat). */
  lastSeen: Date;
  /** Inbound message counter within the current rate-limit window. */
  messageCount: number;
  /** Epoch-ms start of the current rate-limit window. */
  windowStart: number;
  /** Remote IP address of the client. */
  ip: string;
  /**
   * Set to `true` when a WebSocket-protocol ping has been sent and we are
   * waiting for the corresponding pong.  Cleared when a pong arrives or the
   * connection is terminated.  Used by the heartbeat sweep to detect clients
   * that silently disappeared (e.g. mobile network handoff without TCP close).
   */
  pendingPing: boolean;
  /** Tenant identifier for cryptographic tenant isolation. */
  tenantId?: string;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface ConnectionMetrics {
  /** Cumulative connections since server start. */
  totalConnections: number;
  /** Currently open connections. */
  activeConnections: number;
  totalMessagesReceived: number;
  totalMessagesSent: number;
  /** Number of clients subscribed to each channel. */
  subscriptionCounts: Record<ChannelName, number>;
  /** Server uptime in milliseconds. */
  uptime: number;
}

// ─── Redis pub/sub channel keys ───────────────────────────────────────────────

/**
 * Redis pub/sub channel names used for cross-instance broadcasting.
 * Each WS channel name maps to a Redis key used to synchronise all running
 * server instances.
 */
export const REDIS_WS_CHANNELS = {
  prices: "ws:channel:prices",
  health: "ws:channel:health",
  alerts: "ws:channel:alerts",
  bridges: "ws:channel:bridges",
  events: "ws:channel:events",
} as const satisfies Record<ChannelName, string>;
