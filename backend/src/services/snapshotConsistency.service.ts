import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";
import { redis } from "../utils/redis.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Token format version — bump when the encoding changes. */
const TOKEN_VERSION = 1;

/**
 * Redis key that stores the current in-memory WS sequence high-watermark so
 * the REST layer can read it without importing the WS service singleton.
 *
 * Written by the WS service after every broadcast; read here.
 */
export const WS_SEQUENCE_WATERMARK_KEY = "bw:snapshot:ws_sequence";

/**
 * How long (ms) behind the current watermark a cached response is allowed to
 * be before we label it stale via the `X-Snapshot-Stale` header.
 * One full broadcast cycle is acceptable drift.
 */
const STALE_TOLERANCE_SEQUENCES = 1;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapshotWatermark {
  /** Max `id` in `outbox_events` at the moment this snapshot was taken. */
  dbSequence: number;
  /** WS service sequence counter high-watermark at the same moment. */
  wsSequence: number;
  /** ISO-8601 UTC timestamp when the watermark was captured. */
  capturedAt: string;
}

export interface SnapshotToken {
  /** Internal watermark encoded in the token. */
  watermark: SnapshotWatermark;
  /** Raw base64url string clients pass back as `X-Min-Snapshot-Token`. */
  encoded: string;
}

export interface CatchUpDecision {
  /** True when the WS replay buffer covers the gap since the snapshot. */
  canReplay: boolean;
  /**
   * First WS sequence number the client should request for catch-up.
   * Only meaningful when `canReplay` is true.
   */
  sinceSequence: number;
  /**
   * Human-readable reason when `canReplay` is false so the client knows it
   * must do a full REST refresh.
   */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Token encoding / decoding
// ---------------------------------------------------------------------------

interface RawTokenPayload {
  v: number;
  db: number;
  ws: number;
  t: string;
}

function encodeToken(watermark: SnapshotWatermark): string {
  const payload: RawTokenPayload = {
    v: TOKEN_VERSION,
    db: watermark.dbSequence,
    ws: watermark.wsSequence,
    t: watermark.capturedAt,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodeToken(encoded: string): SnapshotWatermark | null {
  try {
    const raw = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as RawTokenPayload;

    if (raw.v !== TOKEN_VERSION) return null;
    if (typeof raw.db !== "number" || typeof raw.ws !== "number") return null;

    return {
      dbSequence: raw.db,
      wsSequence: raw.ws,
      capturedAt: raw.t,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SnapshotConsistencyService {
  private readonly db: Knex;

  constructor(db?: Knex) {
    this.db = db ?? getDatabase();
  }

  // -------------------------------------------------------------------------
  // Watermark reads
  // -------------------------------------------------------------------------

  /**
   * Returns the current DB outbox high-watermark: the max `id` in the
   * `outbox_events` table.  Returns 0 when the table is empty.
   */
  async getDbSequenceWatermark(): Promise<number> {
    try {
      const row = await this.db("outbox_events")
        .max("id as max_id")
        .first() as { max_id: string | number | null } | undefined;

      return row?.max_id != null ? Number(row.max_id) : 0;
    } catch (err) {
      logger.warn({ err }, "snapshot-consistency: failed to read DB watermark");
      return 0;
    }
  }

  /**
   * Returns the WS service's sequence counter high-watermark stored in Redis.
   * Returns 0 when the key is absent (server just started, no events yet).
   */
  async getWsSequenceWatermark(): Promise<number> {
    try {
      const raw = await redis.get(WS_SEQUENCE_WATERMARK_KEY);
      return raw != null ? Number(raw) : 0;
    } catch (err) {
      logger.warn({ err }, "snapshot-consistency: failed to read WS watermark from Redis");
      return 0;
    }
  }

  // -------------------------------------------------------------------------
  // Snapshot token
  // -------------------------------------------------------------------------

  /**
   * Captures the current DB + WS watermarks atomically and returns a snapshot
   * token that identifies this consistent read point.
   *
   * REST handlers call this once per response and stamp the token onto the
   * `X-Snapshot-Token` response header.
   */
  async createSnapshotToken(): Promise<SnapshotToken> {
    const [dbSequence, wsSequence] = await Promise.all([
      this.getDbSequenceWatermark(),
      this.getWsSequenceWatermark(),
    ]);

    const watermark: SnapshotWatermark = {
      dbSequence,
      wsSequence,
      capturedAt: new Date().toISOString(),
    };

    return { watermark, encoded: encodeToken(watermark) };
  }

  /**
   * Decodes a snapshot token sent by the client in `X-Min-Snapshot-Token`.
   * Returns `null` when the token is absent, malformed, or from a future
   * token version (safe to treat as "no boundary requested").
   */
  parseSnapshotToken(encoded: string | undefined): SnapshotWatermark | null {
    if (!encoded) return null;
    const result = decodeToken(encoded);
    if (!result) {
      logger.debug({ encoded }, "snapshot-consistency: unparseable token — ignoring");
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Staleness detection
  // -------------------------------------------------------------------------

  /**
   * Returns true when a cached response taken at `cachedWsSequence` is too
   * old to satisfy a client that requested data after `requestedWsSequence`.
   *
   * A tolerance of {@link STALE_TOLERANCE_SEQUENCES} is applied so that
   * in-flight broadcasts during cache writes do not falsely trigger staleness.
   */
  isCacheStale(requestedWsSequence: number, cachedWsSequence: number): boolean {
    return cachedWsSequence < requestedWsSequence - STALE_TOLERANCE_SEQUENCES;
  }

  // -------------------------------------------------------------------------
  // WebSocket catch-up decision
  // -------------------------------------------------------------------------

  /**
   * Determines whether the WS replay buffer can fill the exact gap between a
   * client's snapshot boundary and the current high-watermark.
   *
   * @param snapshotWsSequence  The WS sequence the client saw at REST read time.
   * @param wsBufferLow         The lowest sequence currently in the WS replay buffer.
   * @param wsCurrentHigh       The current WS sequence high-watermark.
   */
  decideCatchUp(
    snapshotWsSequence: number,
    wsBufferLow: number,
    wsCurrentHigh: number,
  ): CatchUpDecision {
    if (snapshotWsSequence >= wsCurrentHigh) {
      // Client is already up-to-date — nothing to replay.
      return { canReplay: true, sinceSequence: wsCurrentHigh };
    }

    if (snapshotWsSequence < wsBufferLow) {
      // The gap is wider than the replay buffer — a full refresh is required.
      return {
        canReplay: false,
        sinceSequence: snapshotWsSequence,
        reason: `Replay buffer starts at sequence ${wsBufferLow}; snapshot boundary ${snapshotWsSequence} is before it. Perform a full REST refresh.`,
      };
    }

    // Buffer covers the gap — client can catch up via replay.
    return { canReplay: true, sinceSequence: snapshotWsSequence };
  }

  // -------------------------------------------------------------------------
  // Cross-entity consistency contract
  // -------------------------------------------------------------------------

  /**
   * Builds a single snapshot token covering all entity types (prices, health,
   * alerts, bridges).  All REST handlers in a dashboard batch request must
   * use the same token so the UI applies one consistent boundary to all panels.
   *
   * This is identical to `createSnapshotToken()` — the watermarks are global,
   * not per-entity — but the explicit name signals the intent at call sites.
   */
  async createDashboardSnapshotToken(): Promise<SnapshotToken> {
    return this.createSnapshotToken();
  }

  /**
   * Publishes the current WS sequence watermark to Redis so that all replicas
   * and the REST middleware can read it without coupling to the WS service
   * singleton.
   *
   * Called by the WS service after each broadcast.
   */
  async publishWsWatermark(wsSequence: number): Promise<void> {
    try {
      await redis.set(WS_SEQUENCE_WATERMARK_KEY, String(wsSequence), "EX", 300);
    } catch (err) {
      logger.warn({ err }, "snapshot-consistency: failed to publish WS watermark");
    }
  }
}
