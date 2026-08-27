import { createHash } from "node:crypto";
import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { getMetricsService } from "../utils/metrics.js";

/**
 * External Source Response Archive (#1162).
 *
 * Records the raw response Bridge Watch received from a third-party data source
 * so a disputed downstream value can be traced back to exactly what the source
 * returned. Collectors call {@link ExternalSourceResponseArchiveService.record}
 * after every upstream call; operators query the archive through the
 * `/api/v1/sources/response-archive` API; a retention job calls
 * {@link ExternalSourceResponseArchiveService.pruneExpired}.
 *
 * Safety properties enforced here rather than at the call site:
 *  - bodies are capped at `EXTERNAL_SOURCE_ARCHIVE_MAX_BODY_BYTES` and flagged
 *    when truncated, so the archive cannot exhaust disk;
 *  - a sha256 of the full body is always stored, so truncated captures remain
 *    comparable;
 *  - obvious secrets in request params and headers are redacted before storage;
 *  - `record` never throws into the collector — archival is best-effort and a
 *    failure to archive must not fail data collection.
 */

export type ResponseOutcome =
  | "ok"
  | "client_error"
  | "server_error"
  | "timeout"
  | "transport_error";

export interface RecordResponseInput {
  sourceKey: string;
  endpoint: string;
  method?: string;
  requestParams?: Record<string, unknown>;
  statusCode?: number | null;
  latencyMs?: number | null;
  errorKind?: "timeout" | "transport" | null;
  errorMessage?: string | null;
  responseBody?: string | null;
  contentType?: string | null;
  collectionRunId?: string | null;
  subject?: string | null;
  /** Overrides the source's default retention. `null` means legal hold. */
  retentionDays?: number | null;
  collectedAt?: Date;
}

export interface ArchivedResponse {
  id: string;
  sourceKey: string;
  endpoint: string;
  method: string;
  requestParams: Record<string, unknown>;
  outcome: ResponseOutcome;
  statusCode: number | null;
  latencyMs: number | null;
  errorMessage: string | null;
  contentType: string | null;
  bodyTruncated: boolean;
  bodyHash: string | null;
  bodyBytes: number | null;
  collectionRunId: string | null;
  subject: string | null;
  collectedAt: string;
  expiresAt: string | null;
}

export interface ArchivedResponseWithBody extends ArchivedResponse {
  responseBody: string | null;
}

export interface ListArchiveOptions {
  sourceKey?: string;
  subject?: string;
  outcome?: ResponseOutcome;
  collectionRunId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  cursor?: string;
}

export interface ArchiveStats {
  total: number;
  byOutcome: Record<string, number>;
  bySource: Record<string, number>;
  oldestCollectedAt: string | null;
  expiredPending: number;
}

// ── Pure helpers (exported for unit testing) ────────────────────────────────

const SECRET_KEY_PATTERN =
  /(api[_-]?key|apikey|token|secret|password|passwd|authorization|auth|bearer|signature|sig|x-api-key|access[_-]?key|private[_-]?key|session)/i;
const REDACTED = "[REDACTED]";

/**
 * Recursively redact values whose key looks like a credential. Non-plain
 * structures (Date, etc.) are returned untouched. Depth-limited so a
 * pathological payload cannot stack-overflow the collector.
 */
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(k)) {
      out[k] = REDACTED;
    } else if (typeof v === "string" && /^bearer\s+\S+/i.test(v)) {
      out[k] = REDACTED;
    } else {
      out[k] = redactSecrets(v, depth + 1);
    }
  }
  return out;
}

/** Map a transport result onto the coarse outcome the UI filters on. */
export function classifyOutcome(input: {
  statusCode?: number | null;
  errorKind?: "timeout" | "transport" | null;
}): ResponseOutcome {
  if (input.errorKind === "timeout") return "timeout";
  if (input.errorKind === "transport") return "transport_error";
  const code = input.statusCode ?? 0;
  if (code >= 500) return "server_error";
  if (code >= 400) return "client_error";
  if (code >= 200 && code < 400) return "ok";
  return "transport_error";
}

export function hashBody(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/**
 * Clip a body to `maxBytes` on a UTF-8 boundary. Returns the stored slice, the
 * byte length of the *original*, and whether truncation happened.
 */
export function truncateBody(
  body: string,
  maxBytes: number
): { stored: string; originalBytes: number; truncated: boolean } {
  const buf = Buffer.from(body, "utf8");
  if (buf.byteLength <= maxBytes) {
    return { stored: body, originalBytes: buf.byteLength, truncated: false };
  }
  let end = maxBytes;
  // Back off to avoid splitting a multi-byte codepoint.
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return {
    stored: buf.subarray(0, end).toString("utf8"),
    originalBytes: buf.byteLength,
    truncated: true,
  };
}

/**
 * Resolve the retention horizon for a capture. `retentionDays === null` is an
 * explicit legal hold and yields no expiry.
 */
export function resolveExpiry(
  collectedAt: Date,
  retentionDays: number | null | undefined,
  defaultDays: number
): Date | null {
  if (retentionDays === null) return null;
  const days = retentionDays ?? defaultDays;
  return new Date(collectedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

// ── DB row mapping ─────────────────────────────────────────────────────────

function mapRow(r: any): ArchivedResponse {
  return {
    id: r.id,
    sourceKey: r.source_key,
    endpoint: r.endpoint,
    method: r.method,
    requestParams: r.request_params ?? {},
    outcome: r.outcome,
    statusCode: r.status_code ?? null,
    latencyMs: r.latency_ms ?? null,
    errorMessage: r.error_message ?? null,
    contentType: r.content_type ?? null,
    bodyTruncated: Boolean(r.body_truncated),
    bodyHash: r.body_hash ?? null,
    bodyBytes: r.body_bytes ?? null,
    collectionRunId: r.collection_run_id ?? null,
    subject: r.subject ?? null,
    collectedAt: new Date(r.collected_at).toISOString(),
    expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
  };
}

const MAX_PAGE = 200;
const DEFAULT_PAGE = 50;

export class ExternalSourceResponseArchiveService {
  constructor(
    private readonly db: Knex = getDatabase(),
    private readonly settings = {
      enabled: config.EXTERNAL_SOURCE_ARCHIVE_ENABLED,
      retentionDays: config.EXTERNAL_SOURCE_ARCHIVE_RETENTION_DAYS,
      maxBodyBytes: config.EXTERNAL_SOURCE_ARCHIVE_MAX_BODY_BYTES,
      pruneBatch: config.EXTERNAL_SOURCE_ARCHIVE_PRUNE_BATCH,
    }
  ) {}

  /**
   * Archive one upstream response. Best-effort: on any failure it logs and
   * returns null rather than throwing into the caller's collection path.
   */
  async record(input: RecordResponseInput): Promise<ArchivedResponse | null> {
    if (!this.settings.enabled) return null;

    try {
      const collectedAt = input.collectedAt ?? new Date();
      const outcome = classifyOutcome({
        statusCode: input.statusCode,
        errorKind: input.errorKind,
      });

      let storedBody: string | null = null;
      let bodyHash: string | null = null;
      let bodyBytes: number | null = null;
      let truncated = false;
      if (typeof input.responseBody === "string") {
        bodyHash = hashBody(input.responseBody);
        const clipped = truncateBody(input.responseBody, this.settings.maxBodyBytes);
        storedBody = clipped.stored;
        bodyBytes = clipped.originalBytes;
        truncated = clipped.truncated;
      }

      const [row] = await this.db("external_source_responses")
        .insert({
          source_key: input.sourceKey,
          endpoint: input.endpoint,
          method: (input.method ?? "GET").toUpperCase().slice(0, 10),
          request_params: JSON.stringify(
            redactSecrets(input.requestParams ?? {}) ?? {}
          ),
          outcome,
          status_code: input.statusCode ?? null,
          latency_ms:
            input.latencyMs != null ? Math.max(0, Math.round(input.latencyMs)) : null,
          error_message: input.errorMessage?.slice(0, 1000) ?? null,
          response_body: storedBody,
          content_type: input.contentType?.slice(0, 200) ?? null,
          body_truncated: truncated,
          body_hash: bodyHash,
          body_bytes: bodyBytes,
          collection_run_id: input.collectionRunId ?? null,
          subject: input.subject?.slice(0, 200) ?? null,
          collected_at: collectedAt,
          expires_at: resolveExpiry(
            collectedAt,
            input.retentionDays,
            this.settings.retentionDays
          ),
        })
        .returning("*");

      getMetricsService().recordCustomMetric(
        "external_source_responses_archived_total",
        1,
        "count",
        { source: input.sourceKey, outcome }
      );

      return mapRow(row);
    } catch (error) {
      logger.error(
        { error, sourceKey: input.sourceKey, endpoint: input.endpoint },
        "Failed to archive external source response"
      );
      return null;
    }
  }

  async get(id: string): Promise<ArchivedResponseWithBody | null> {
    const row = await this.db("external_source_responses").where({ id }).first();
    if (!row) return null;
    return { ...mapRow(row), responseBody: row.response_body ?? null };
  }

  async list(
    options: ListArchiveOptions = {}
  ): Promise<{ items: ArchivedResponse[]; nextCursor: string | null }> {
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE, 1), MAX_PAGE);
    const query = this.db("external_source_responses")
      .orderBy("collected_at", "desc")
      .orderBy("id", "desc")
      .limit(limit + 1);

    if (options.sourceKey) query.where({ source_key: options.sourceKey });
    if (options.subject) query.where({ subject: options.subject });
    if (options.outcome) query.where({ outcome: options.outcome });
    if (options.collectionRunId)
      query.where({ collection_run_id: options.collectionRunId });
    if (options.from) query.where("collected_at", ">=", options.from);
    if (options.to) query.where("collected_at", "<=", options.to);
    if (options.cursor) {
      const at = new Date(options.cursor);
      if (!Number.isNaN(at.getTime())) query.where("collected_at", "<", at);
    }

    const rows = await query;
    const page = rows.slice(0, limit).map(mapRow);
    const nextCursor =
      rows.length > limit ? page[page.length - 1]?.collectedAt ?? null : null;
    return { items: page, nextCursor };
  }

  async stats(sourceKey?: string): Promise<ArchiveStats> {
    const base = () => {
      const q = this.db("external_source_responses");
      if (sourceKey) q.where({ source_key: sourceKey });
      return q;
    };

    const [{ count: total }] = await base().count<{ count: string }[]>("* as count");
    const byOutcomeRows = await base()
      .select("outcome")
      .count<{ outcome: string; count: string }[]>("* as count")
      .groupBy("outcome");
    const bySourceRows = await base()
      .select("source_key")
      .count<{ source_key: string; count: string }[]>("* as count")
      .groupBy("source_key");
    const oldest = await base().min<{ min: string | null }[]>("collected_at as min").first();
    const [{ count: expiredPending }] = await base()
      .whereNotNull("expires_at")
      .where("expires_at", "<=", new Date())
      .count<{ count: string }[]>("* as count");

    return {
      total: Number(total),
      byOutcome: Object.fromEntries(
        byOutcomeRows.map((r) => [r.outcome, Number(r.count)])
      ),
      bySource: Object.fromEntries(
        bySourceRows.map((r) => [r.source_key, Number(r.count)])
      ),
      oldestCollectedAt: oldest?.min ? new Date(oldest.min).toISOString() : null,
      expiredPending: Number(expiredPending),
    };
  }

  /**
   * Delete responses past their retention horizon, in bounded batches. Rows on
   * legal hold (`expires_at IS NULL`) are never touched. Returns the number
   * deleted.
   */
  async pruneExpired(now: Date = new Date()): Promise<number> {
    let deletedTotal = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const ids = await this.db("external_source_responses")
        .whereNotNull("expires_at")
        .where("expires_at", "<=", now)
        .orderBy("expires_at", "asc")
        .limit(this.settings.pruneBatch)
        .pluck("id");
      if (ids.length === 0) break;

      const deleted = await this.db("external_source_responses")
        .whereIn("id", ids)
        .delete();
      deletedTotal += deleted;
      if (ids.length < this.settings.pruneBatch) break;
    }

    if (deletedTotal > 0) {
      logger.info({ deleted: deletedTotal }, "Pruned expired external source responses");
      getMetricsService().recordCustomMetric(
        "external_source_responses_pruned_total",
        deletedTotal,
        "count"
      );
    }
    return deletedTotal;
  }

  /**
   * Extend or clear the retention horizon of a single archived response — used
   * to place a legal hold (`retentionDays === null`) on evidence tied to an
   * open incident, or to release one.
   */
  async setRetention(
    id: string,
    retentionDays: number | null
  ): Promise<ArchivedResponse | null> {
    const row = await this.db("external_source_responses").where({ id }).first();
    if (!row) return null;
    const expiresAt = resolveExpiry(
      new Date(row.collected_at),
      retentionDays,
      this.settings.retentionDays
    );
    const [updated] = await this.db("external_source_responses")
      .where({ id })
      .update({ expires_at: expiresAt })
      .returning("*");
    return mapRow(updated);
  }
}

export const externalSourceResponseArchiveService =
  new ExternalSourceResponseArchiveService();
