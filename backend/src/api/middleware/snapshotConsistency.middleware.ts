import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { SnapshotConsistencyService } from "../../services/snapshotConsistency.service.js";
import { logger } from "../../utils/logger.js";

// ---------------------------------------------------------------------------
// Header names (constants to avoid typo drift)
// ---------------------------------------------------------------------------

/** Stamped on every REST response — encodes the DB + WS watermarks. */
export const SNAPSHOT_TOKEN_HEADER = "X-Snapshot-Token";

/** Stamped on every REST response — the raw WS sequence number for easy parsing. */
export const SNAPSHOT_SEQUENCE_HEADER = "X-Snapshot-Sequence";

/**
 * Clients send this header to declare the minimum snapshot boundary they are
 * willing to accept.  When the server's cached response is older than this
 * boundary, `X-Snapshot-Stale: 1` is added to the response.
 */
export const MIN_SNAPSHOT_TOKEN_HEADER = "X-Min-Snapshot-Token";

/**
 * Set to "1" when the response was served from cache and that cached snapshot
 * is older than the boundary the client requested via
 * `X-Min-Snapshot-Token`.  The data is still returned — the header is purely
 * informational so the client can decide whether to re-request or accept the
 * stale data.
 */
export const SNAPSHOT_STALE_HEADER = "X-Snapshot-Stale";

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Snapshot-consistency middleware.
 *
 * On every response:
 *   1. Captures the current DB + WS watermarks and stamps them as
 *      `X-Snapshot-Token` and `X-Snapshot-Sequence` headers.
 *   2. If the request carries `X-Min-Snapshot-Token`, decodes it and
 *      compares the encoded WS boundary against the current watermark.
 *      When the current watermark has not yet advanced past the client's
 *      boundary (i.e. the cache could be stale), sets `X-Snapshot-Stale: 1`.
 *
 * Endpoints that serve cached data and need fine-grained staleness control
 * can also read `request.snapshotBoundary` (populated by this middleware)
 * and compare it against the cache-entry's own snapshot sequence.
 */
export async function registerSnapshotConsistency(
  server: FastifyInstance,
): Promise<void> {
  const svc = new SnapshotConsistencyService();

  // Decorate request so downstream handlers can access the parsed boundary
  // without re-decoding the header.
  server.decorateRequest("snapshotBoundaryWsSeq", null);

  server.addHook(
    "onSend",
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Skip non-API routes (health checks, metrics, WebSocket upgrades).
      if (
        !request.url.startsWith("/api/") ||
        request.headers.upgrade?.toLowerCase() === "websocket"
      ) {
        return;
      }

      // Parse the client's requested minimum boundary (may be absent).
      const minTokenHeader = request.headers[
        MIN_SNAPSHOT_TOKEN_HEADER.toLowerCase()
      ] as string | undefined;

      const boundary = minTokenHeader
        ? svc.parseSnapshotToken(minTokenHeader)
        : null;

      // Capture the current watermarks for this response.
      let snapshotToken;
      try {
        snapshotToken = await svc.createSnapshotToken();
      } catch (err) {
        logger.warn({ err }, "snapshot-consistency: failed to create token — skipping headers");
        return;
      }

      reply.header(SNAPSHOT_TOKEN_HEADER, snapshotToken.encoded);
      reply.header(
        SNAPSHOT_SEQUENCE_HEADER,
        String(snapshotToken.watermark.wsSequence),
      );

      // Staleness check: is the current server state older than what the
      // client asked for?  This can happen when a replica's Redis cache has
      // not yet seen the latest broadcast.
      if (boundary) {
        const stale = svc.isCacheStale(
          boundary.wsSequence,
          snapshotToken.watermark.wsSequence,
        );
        if (stale) {
          reply.header(SNAPSHOT_STALE_HEADER, "1");
          logger.debug(
            {
              requested: boundary.wsSequence,
              current: snapshotToken.watermark.wsSequence,
              url: request.url,
            },
            "snapshot-consistency: stale cache response flagged",
          );
        }
      }
    },
  );

  logger.info("Snapshot-consistency middleware registered");
}
