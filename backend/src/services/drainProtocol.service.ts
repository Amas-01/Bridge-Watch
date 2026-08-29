import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { Gauge, Counter } from "prom-client";
import { wsServer } from "../api/websocket/websocket.server.js";
import { JobQueue } from "../workers/queue.js";
import { getSupplyVerificationQueue } from "../jobs/supplyVerification.job.js";
import { stopWebhookWorker } from "../workers/webhookDelivery.worker.js";

export type DrainState = "ACTIVE" | "DRAINING" | "DRAINED" | "CANCELLED" | "FAILED";
export type DrainMode = "graceful" | "force" | "read_only";

export interface DrainOptions {
  nodeId?: string;
  timeoutSeconds?: number;
  reason?: string;
  initiatedBy?: string;
  mode?: DrainMode;
  metadata?: Record<string, unknown>;
}

export interface DrainStatus {
  sessionId: string | null;
  nodeId: string;
  state: DrainState;
  drainMode: DrainMode;
  inFlightRequests: number;
  activeConnections: number;
  activeStreams: number;
  startedAt: string | null;
  drainedAt: string | null;
  reason: string | null;
  initiatedBy: string | null;
  timeoutSeconds: number;
}

// Prometheus metrics for Graceful Shutdown Drain Protocol
export const drainStatusMetric = new Gauge({
  name: "bridge_watch_drain_status",
  help: "System drain status (0 = ACTIVE, 1 = DRAINING, 2 = DRAINED, 3 = CANCELLED, 4 = FAILED)",
});

export const inFlightRequestsMetric = new Gauge({
  name: "bridge_watch_drain_in_flight_requests",
  help: "Current number of in-flight HTTP requests during drain",
});

export const drainEventsCounter = new Counter({
  name: "bridge_watch_drain_events_total",
  help: "Total count of drain protocol lifecycle events",
  labelNames: ["event_type", "state"],
});

export class DrainProtocolService {
  private readonly db = getDatabase();
  private currentState: DrainState = "ACTIVE";
  private currentMode: DrainMode = "graceful";
  private currentSessionId: string | null = null;
  private nodeId: string = process.env.NODE_ID || "node-1";
  private inFlightRequests = 0;
  private activeStreams = 0;
  private drainStartedAt: Date | null = null;
  private drainDrainedAt: Date | null = null;
  private drainReason: string | null = null;
  private drainInitiatedBy: string | null = null;
  private timeoutSeconds = 30;
  private drainTimer: NodeJS.Timeout | null = null;

  constructor() {
    drainStatusMetric.set(0); // 0 = ACTIVE
  }

  public getNodeId(): string {
    return this.nodeId;
  }

  public getState(): DrainState {
    return this.currentState;
  }

  public getMode(): DrainMode {
    return this.currentMode;
  }

  public isDraining(): boolean {
    return this.currentState === "DRAINING" || this.currentState === "DRAINED";
  }

  public incrementInFlight(): void {
    this.inFlightRequests++;
    inFlightRequestsMetric.set(this.inFlightRequests);
  }

  public decrementInFlight(): void {
    if (this.inFlightRequests > 0) {
      this.inFlightRequests--;
    }
    inFlightRequestsMetric.set(this.inFlightRequests);
  }

  public getInFlightCount(): number {
    return this.inFlightRequests;
  }

  /**
   * Initiates the Graceful Shutdown Drain Protocol
   */
  public async startDrain(options: DrainOptions = {}): Promise<DrainStatus> {
    if (this.currentState === "DRAINING") {
      logger.warn({ nodeId: this.nodeId, sessionId: this.currentSessionId }, "Drain protocol is already in progress");
      return this.getStatus();
    }

    this.nodeId = options.nodeId || this.nodeId;
    this.currentState = "DRAINING";
    this.currentMode = options.mode || "graceful";
    this.timeoutSeconds = options.timeoutSeconds || 30;
    this.drainStartedAt = new Date();
    this.drainDrainedAt = null;
    this.drainReason = options.reason || "Scheduled shutdown / maintenance";
    this.drainInitiatedBy = options.initiatedBy || "admin";

    drainStatusMetric.set(1); // 1 = DRAINING
    drainEventsCounter.inc({ event_type: "DRAIN_INITIATED", state: "DRAINING" });

    logger.info(
      {
        nodeId: this.nodeId,
        mode: this.currentMode,
        timeoutSeconds: this.timeoutSeconds,
        reason: this.drainReason,
      },
      "Initiating Graceful Shutdown Drain Protocol"
    );

    // Persist drain session to database
    try {
      const hasTable = await this.db.schema.hasTable("shutdown_drain_sessions");
      if (hasTable) {
        const [inserted] = await this.db("shutdown_drain_sessions")
          .insert({
            node_id: this.nodeId,
            state: "DRAINING",
            drain_mode: this.currentMode,
            reason: this.drainReason,
            initiated_by: this.drainInitiatedBy,
            timeout_seconds: this.timeoutSeconds,
            pending_jobs_count: 0,
            active_connections_count: 0,
            active_streams_count: this.activeStreams,
            started_at: this.drainStartedAt,
            metadata: JSON.stringify(options.metadata || {}),
          })
          .returning("*");

        this.currentSessionId = inserted?.id || null;

        if (this.currentSessionId) {
          await this.logDrainEvent("DRAIN_INITIATED", "Drain protocol initiated", {
            mode: this.currentMode,
            timeoutSeconds: this.timeoutSeconds,
            reason: this.drainReason,
          });
        }
      }
    } catch (err) {
      logger.error({ err }, "Failed to persist shutdown drain session to DB");
    }

    // Step 1: Pause background job queues & workers
    try {
      await JobQueue.getInstance().stop().catch(() => {});
      await getSupplyVerificationQueue().stop().catch(() => {});
      await stopWebhookWorker().catch(() => {});
      await this.logDrainEvent("JOBS_PAUSED", "Background queues and workers stopped");
    } catch (err) {
      logger.error({ err }, "Error stopping background workers during drain");
    }

    // Step 2: Gracefully shutdown WebSocket server (broadcast disconnect frame)
    try {
      await wsServer.shutdown().catch(() => {});
      await this.logDrainEvent("WS_DRAINED", "WebSocket connections gracefully drained");
    } catch (err) {
      logger.error({ err }, "Error shutting down WebSockets during drain");
    }

    // Set up timeout timer for forceful completion if graceful timeout is reached
    this.drainTimer = setTimeout(() => {
      this.handleDrainTimeout().catch((err) => {
        logger.error({ err }, "Error during drain timeout resolution");
      });
    }, this.timeoutSeconds * 1000);

    // Check if system is immediately drained
    if (this.inFlightRequests === 0) {
      await this.completeDrain();
    }

    return this.getStatus();
  }

  /**
   * Completes the drain protocol when all tasks/connections are finished
   */
  public async completeDrain(): Promise<DrainStatus> {
    if (this.currentState !== "DRAINING") {
      return this.getStatus();
    }

    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }

    this.currentState = "DRAINED";
    this.drainDrainedAt = new Date();
    drainStatusMetric.set(2); // 2 = DRAINED
    drainEventsCounter.inc({ event_type: "DRAIN_COMPLETED", state: "DRAINED" });

    logger.info({ nodeId: this.nodeId, sessionId: this.currentSessionId }, "Graceful Shutdown Drain Protocol completed successfully");

    if (this.currentSessionId) {
      try {
        const hasTable = await this.db.schema.hasTable("shutdown_drain_sessions");
        if (hasTable) {
          await this.db("shutdown_drain_sessions")
            .where({ id: this.currentSessionId })
            .update({
              state: "DRAINED",
              drained_at: this.drainDrainedAt,
              pending_jobs_count: this.inFlightRequests,
              updated_at: new Date(),
            });

          await this.logDrainEvent("DRAIN_COMPLETED", "Graceful shutdown drain completed successfully");
        }
      } catch (err) {
        logger.error({ err }, "Failed to update DB on drain completion");
      }
    }

    return this.getStatus();
  }

  /**
   * Cancels an active drain session and resumes normal operation
   */
  public async cancelDrain(cancelledBy = "admin"): Promise<DrainStatus> {
    if (this.currentState !== "DRAINING" && this.currentState !== "DRAINED") {
      logger.warn("No active drain session to cancel");
      return this.getStatus();
    }

    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }

    const previousState = this.currentState;
    this.currentState = "CANCELLED";
    drainStatusMetric.set(3); // 3 = CANCELLED
    drainEventsCounter.inc({ event_type: "DRAIN_CANCELLED", state: "CANCELLED" });

    logger.info({ nodeId: this.nodeId, cancelledBy }, "Graceful shutdown drain protocol cancelled by operator");

    if (this.currentSessionId) {
      try {
        const hasTable = await this.db.schema.hasTable("shutdown_drain_sessions");
        if (hasTable) {
          await this.db("shutdown_drain_sessions")
            .where({ id: this.currentSessionId })
            .update({
              state: "CANCELLED",
              cancelled_at: new Date(),
              updated_at: new Date(),
            });

          await this.logDrainEvent("DRAIN_CANCELLED", `Drain protocol cancelled by ${cancelledBy}`, {
            previousState,
          });
        }
      } catch (err) {
        logger.error({ err }, "Failed to update DB on drain cancellation");
      }
    }

    // Reset back to ACTIVE state
    this.currentState = "ACTIVE";
    this.currentSessionId = null;
    drainStatusMetric.set(0); // 0 = ACTIVE

    return this.getStatus();
  }

  /**
   * Forcefully completes the drain session
   */
  public async forceShutdown(reason = "Force shutdown requested"): Promise<DrainStatus> {
    if (this.drainTimer) {
      clearTimeout(this.drainTimer);
      this.drainTimer = null;
    }

    this.currentState = "FAILED";
    drainStatusMetric.set(4); // 4 = FAILED
    drainEventsCounter.inc({ event_type: "FORCE_SHUTDOWN", state: "FAILED" });

    logger.warn({ nodeId: this.nodeId, reason }, "Forceful shutdown drain executed");

    if (this.currentSessionId) {
      try {
        const hasTable = await this.db.schema.hasTable("shutdown_drain_sessions");
        if (hasTable) {
          await this.db("shutdown_drain_sessions")
            .where({ id: this.currentSessionId })
            .update({
              state: "FAILED",
              updated_at: new Date(),
            });

          await this.logDrainEvent("FORCE_SHUTDOWN", `Force shutdown executed: ${reason}`);
        }
      } catch (err) {
        logger.error({ err }, "Failed to log force shutdown in DB");
      }
    }

    return this.getStatus();
  }

  /**
   * Returns current drain status
   */
  public getStatus(): DrainStatus {
    return {
      sessionId: this.currentSessionId,
      nodeId: this.nodeId,
      state: this.currentState,
      drainMode: this.currentMode,
      inFlightRequests: this.inFlightRequests,
      activeConnections: 0,
      activeStreams: this.activeStreams,
      startedAt: this.drainStartedAt ? this.drainStartedAt.toISOString() : null,
      drainedAt: this.drainDrainedAt ? this.drainDrainedAt.toISOString() : null,
      reason: this.drainReason,
      initiatedBy: this.drainInitiatedBy,
      timeoutSeconds: this.timeoutSeconds,
    };
  }

  /**
   * Fetches drain session history
   */
  public async getDrainHistory(limit = 20): Promise<unknown[]> {
    try {
      const hasTable = await this.db.schema.hasTable("shutdown_drain_sessions");
      if (!hasTable) return [];

      return await this.db("shutdown_drain_sessions")
        .select("*")
        .orderBy("created_at", "desc")
        .limit(limit);
    } catch (err) {
      logger.error({ err }, "Failed to fetch shutdown drain history");
      return [];
    }
  }

  private async handleDrainTimeout(): Promise<void> {
    if (this.currentState === "DRAINING") {
      logger.warn(
        {
          nodeId: this.nodeId,
          remainingInFlight: this.inFlightRequests,
          timeoutSeconds: this.timeoutSeconds,
        },
        "Drain timeout reached before all in-flight requests completed; executing completion fallback"
      );

      await this.logDrainEvent("DRAIN_TIMEOUT", "Timeout reached during drain", {
        remainingInFlight: this.inFlightRequests,
      });

      await this.completeDrain();
    }
  }

  private async logDrainEvent(eventType: string, message: string, details: Record<string, unknown> = {}): Promise<void> {
    if (!this.currentSessionId) return;

    try {
      const hasTable = await this.db.schema.hasTable("shutdown_drain_logs");
      if (hasTable) {
        await this.db("shutdown_drain_logs").insert({
          session_id: this.currentSessionId,
          event_type: eventType,
          message,
          details: JSON.stringify(details),
          timestamp: new Date(),
        });
      }
    } catch (err) {
      logger.warn({ err, eventType }, "Failed to log drain event to database");
    }
  }
}

export const drainProtocolService = new DrainProtocolService();
