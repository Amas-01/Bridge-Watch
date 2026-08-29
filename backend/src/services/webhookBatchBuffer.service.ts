import { logger } from "../utils/logger.js";
import type { WebhookEventType } from "./webhook.service.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BufferedEvent {
  deliveryId: string;
  eventType: WebhookEventType;
  payload: Record<string, unknown>;
  bufferedAt: number;
}

export interface BatchBufferStatus {
  endpointId: string;
  eventCount: number;
  ageMs: number | null;
  windowMs: number;
  willFlushAt: number;
}

export type BatchFlushCallback = (params: {
  endpointId: string;
  eventType: WebhookEventType;
  events: Array<Record<string, unknown>>;
  deliveryIds: string[];
}) => Promise<void>;

interface BatchEntry {
  events: BufferedEvent[];
  timer: ReturnType<typeof setTimeout>;
  windowMs: number;
  scheduledFlushAt: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class WebhookBatchBufferService {
  private readonly buffers = new Map<string, BatchEntry>();

  constructor(private readonly onFlush: BatchFlushCallback) {}

  /**
   * Add one event to the buffer for a given endpoint.
   * If no window is open yet, starts one using windowMs.
   * The flush fires automatically when the window expires.
   */
  buffer(params: {
    endpointId: string;
    deliveryId: string;
    eventType: WebhookEventType;
    payload: Record<string, unknown>;
    windowMs: number;
  }): void {
    const { endpointId, deliveryId, eventType, payload, windowMs } = params;

    const event: BufferedEvent = { deliveryId, eventType, payload, bufferedAt: Date.now() };

    const existing = this.buffers.get(endpointId);
    if (existing) {
      existing.events.push(event);
      logger.debug(
        { endpointId, bufferedCount: existing.events.length },
        "Event appended to open batch window",
      );
      return;
    }

    const scheduledFlushAt = Date.now() + windowMs;
    const timer = setTimeout(() => {
      this.flush(endpointId).catch((err) => {
        logger.error({ endpointId, err }, "Auto-flush of batch buffer failed");
      });
    }, windowMs);

    this.buffers.set(endpointId, { events: [event], timer, windowMs, scheduledFlushAt });

    logger.info(
      { endpointId, windowMs, scheduledFlushAt: new Date(scheduledFlushAt).toISOString() },
      "Batch window opened",
    );
  }

  /**
   * Immediately flush all buffered events for an endpoint as a single batch.
   * Called automatically by the timer or explicitly via the manual-flush route.
   */
  async flush(endpointId: string): Promise<{ flushed: number }> {
    const entry = this.buffers.get(endpointId);
    if (!entry || entry.events.length === 0) {
      this.buffers.delete(endpointId);
      return { flushed: 0 };
    }

    clearTimeout(entry.timer);
    this.buffers.delete(endpointId);

    const events = [...entry.events];
    const eventType = events[0].eventType;
    const payloads = events.map((e) => e.payload);
    const deliveryIds = events.map((e) => e.deliveryId);

    logger.info(
      { endpointId, eventCount: events.length, eventType },
      "Flushing batch buffer",
    );

    await this.onFlush({ endpointId, eventType, events: payloads, deliveryIds });

    return { flushed: events.length };
  }

  /** Get live status for one endpoint's buffer (null if no window is open). */
  getStatus(endpointId: string): BatchBufferStatus | null {
    const entry = this.buffers.get(endpointId);
    if (!entry) return null;
    return {
      endpointId,
      eventCount: entry.events.length,
      ageMs: entry.events.length > 0 ? Date.now() - entry.events[0].bufferedAt : null,
      windowMs: entry.windowMs,
      willFlushAt: entry.scheduledFlushAt,
    };
  }

  /** List status for every currently-open batch window. */
  listAll(): BatchBufferStatus[] {
    return Array.from(this.buffers.keys())
      .map((id) => this.getStatus(id))
      .filter((s): s is BatchBufferStatus => s !== null);
  }

  /** Flush all open windows — call on graceful shutdown. */
  async flushAll(): Promise<void> {
    await Promise.allSettled(Array.from(this.buffers.keys()).map((id) => this.flush(id)));
  }

  get openWindowCount(): number {
    return this.buffers.size;
  }
}
