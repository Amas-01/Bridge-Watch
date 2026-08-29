import type { ClientState } from "../types.js";
import type { WebSocketServer } from "../websocket.server.js";
import {
  WsErrorCode,
  PRIVATE_CHANNELS,
  ALL_CHANNELS,
  type ClientSubscribeMessage,
  type SnapshotRequiredMessage,
  type ReplayCompleteMessage,
} from "../types.js";
import { SnapshotConsistencyService } from "../../../services/snapshotConsistency.service.js";
import { WebsocketService } from "../../../services/websocket.js";
import { logger } from "../../../utils/logger.js";

const snapshotSvc = new SnapshotConsistencyService();

/**
 * Handle a `subscribe` message from a client.
 *
 * Validates:
 *  1. The channel name is recognised.
 *  2. Private channels require a valid auth token (either supplied in this
 *     message or already validated at connection time via a URL query param).
 *
 * On success, registers the subscription, replies with a `subscribed` ack,
 * and — when `sinceSequence` or `snapshotToken` is present — performs
 * snapshot catch-up:
 *   a. Resolves the boundary sequence from whichever field was supplied.
 *   b. Checks whether the WS replay buffer covers that boundary.
 *   c. If yes: replays buffered events for the channel and sends
 *      `replay_complete`.
 *   d. If no: sends `snapshot_required` so the client knows it must do a
 *      fresh REST fetch before listening to live events.
 */
export function handleSubscribe(
  state: ClientState,
  message: ClientSubscribeMessage,
  server: WebSocketServer
): void {
  const { channel, token } = message;
  const now = new Date().toISOString();

  // ── Validate channel name ─────────────────────────────────────────────────
  if (!(ALL_CHANNELS as string[]).includes(channel)) {
    server.sendToClientState(state, {
      type: "error",
      message: `Unknown channel "${channel}". Valid channels: ${ALL_CHANNELS.join(", ")}.`,
      code: WsErrorCode.UNKNOWN_CHANNEL,
      timestamp: now,
    });
    return;
  }

  // ── Auth check for private channels ──────────────────────────────────────
  if (PRIVATE_CHANNELS.has(channel)) {
    const authenticated =
      state.isAuthenticated ||
      (token !== undefined && server.validateToken(token));

    if (!authenticated) {
      server.sendToClientState(state, {
        type: "error",
        message: `Channel "${channel}" requires authentication. Provide a valid token.`,
        code: WsErrorCode.UNAUTHORIZED,
        timestamp: now,
      });
      return;
    }

    if (token && !state.isAuthenticated) {
      state.isAuthenticated = true;
      state.tenantId = state.tenantId || "authenticated";
    }
  }

  // ── Idempotent subscription ───────────────────────────────────────────────
  if (state.subscriptions.has(channel)) {
    server.sendToClientState(state, {
      type: "subscribed",
      channel,
      timestamp: now,
    });
    // Still honour catch-up requests even on re-subscribe (e.g. reconnect).
    performCatchUp(state, message, server, now);
    return;
  }

  server.addSubscription(state, channel);

  server.sendToClientState(state, {
    type: "subscribed",
    channel,
    timestamp: now,
  });

  // ── Snapshot catch-up ─────────────────────────────────────────────────────
  performCatchUp(state, message, server, now);
}

// ---------------------------------------------------------------------------
// Catch-up helper (sync shell, async body fire-and-forget)
// ---------------------------------------------------------------------------

function performCatchUp(
  state: ClientState,
  message: ClientSubscribeMessage,
  server: WebSocketServer,
  now: string,
): void {
  const { channel, sinceSequence, snapshotToken } = message;

  // Resolve the boundary: explicit sinceSequence wins; fall back to decoding
  // the snapshotToken the client copied from the REST X-Snapshot-Token header.
  let boundarySequence: number | undefined = sinceSequence;

  if (boundarySequence === undefined && snapshotToken) {
    const parsed = snapshotSvc.parseSnapshotToken(snapshotToken);
    if (parsed) {
      boundarySequence = parsed.wsSequence;
    }
  }

  if (boundarySequence === undefined) {
    // No catch-up requested — live subscription only.
    return;
  }

  // Fire-and-forget: we do not await inside the sync handler.
  void performCatchUpAsync(state, channel, boundarySequence, server, now);
}

async function performCatchUpAsync(
  state: ClientState,
  channel: string,
  boundarySequence: number,
  server: WebSocketServer,
  now: string,
): Promise<void> {
  try {
    const replaySvc = WebsocketService.getInstance();
    const metrics = replaySvc.getReplayMetrics();
    const wsCurrentHigh = metrics.sequenceHighWatermark;

    // The replay buffer covers [bufferLow, wsCurrentHigh].
    // The buffer's lowest sequence = highWatermark - totalStored (approximate).
    // When the buffer has wrapped we use the oldest stored sequence instead.
    // The WebsocketService does not expose bufferLow directly, so we compute
    // it conservatively: if totalStored covers the gap, replay; else require refresh.
    const totalBuffered = Object.values(metrics.topicSizes).reduce(
      (sum, n) => sum + n,
      0,
    );

    // Conservative lower-bound: highWatermark minus the total buffered count.
    const wsBufferLow = Math.max(0, wsCurrentHigh - totalBuffered);

    const decision = snapshotSvc.decideCatchUp(
      boundarySequence,
      wsBufferLow,
      wsCurrentHigh,
    );

    if (!decision.canReplay) {
      const msg: SnapshotRequiredMessage = {
        type: "snapshot_required",
        channel: channel as import("../types.js").ChannelName,
        requestedSinceSequence: boundarySequence,
        bufferLowSequence: wsBufferLow,
        reason: decision.reason ?? "Replay buffer does not cover the requested boundary.",
        timestamp: now,
      };
      server.sendToClientState(state, msg);
      logger.info(
        { clientId: state.id, channel, boundarySequence, wsBufferLow },
        "snapshot-consistency: full refresh required",
      );
      return;
    }

    // Replay buffered events for this channel since the boundary.
    // Channel names match topic names used in the WS service.
    const replayMessages = replaySvc.getReplayMessages([channel], {
      sinceSequence: decision.sinceSequence,
    });

    for (const msg of replayMessages) {
      // Convert the stored broadcast message format to an OutboundDataMessage.
      // The WS service stores typed payloads — pass through as-is so the client
      // sees the same structure it would from a live broadcast.
      server.sendToClientState(
        state,
        msg.payload as import("../types.js").OutboundDataMessage,
      );
    }

    const completeMsg: ReplayCompleteMessage = {
      type: "replay_complete",
      channel: channel as import("../types.js").ChannelName,
      fromSequence: decision.sinceSequence,
      toSequence: wsCurrentHigh,
      count: replayMessages.length,
      timestamp: new Date().toISOString(),
    };
    server.sendToClientState(state, completeMsg);

    logger.info(
      {
        clientId: state.id,
        channel,
        fromSequence: decision.sinceSequence,
        toSequence: wsCurrentHigh,
        count: replayMessages.length,
      },
      "snapshot-consistency: catch-up replay complete",
    );
  } catch (err) {
    logger.warn(
      { err, clientId: state.id, channel, boundarySequence },
      "snapshot-consistency: catch-up failed — client will receive live events only",
    );
  }
}
