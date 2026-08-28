import { Queue, Worker } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { exportQuotaService } from "../services/exportQuota.service.js";

const QUEUE_NAME = "export-quota-reset-queue";
const JOB_NAME = "reset-export-quotas";

// =============================================================================
// EXPORT QUOTA RESET QUEUE
// =============================================================================

export class ExportQuotaResetQueue extends Queue {
  private static instance: ExportQuotaResetQueue;

  private constructor() {
    super(QUEUE_NAME, {
      connection: {
        host: config.REDIS_HOST || "localhost",
        port: config.REDIS_PORT || 6379,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
        removeOnComplete: {
          age: 86400, // Keep completed jobs for 24 hours
          count: 50,
        },
        removeOnFail: {
          age: 604800, // Keep failed jobs for 7 days
        },
      },
    });

    logger.info({}, "Export quota reset queue initialized");
  }

  public static getInstance(): ExportQuotaResetQueue {
    if (!ExportQuotaResetQueue.instance) {
      ExportQuotaResetQueue.instance = new ExportQuotaResetQueue();
    }
    return ExportQuotaResetQueue.instance;
  }

  /**
   * Schedule daily quota reset check
   */
  async scheduleDailyReset(): Promise<void> {
    // Schedule job to run daily at midnight UTC
    await this.add(
      JOB_NAME,
      {},
      {
        repeat: {
          pattern: "0 0 * * *", // Daily at midnight UTC
        },
        jobId: "daily-export-quota-reset",
      }
    );

    logger.info({}, "Daily export quota reset scheduled (midnight UTC)");
  }

  /**
   * Trigger immediate quota reset
   */
  async triggerReset(): Promise<void> {
    await this.add(JOB_NAME, {});
    logger.info({}, "Export quota reset job enqueued");
  }
}

// =============================================================================
// EXPORT QUOTA RESET WORKER
// =============================================================================

export class ExportQuotaResetWorker extends Worker {
  constructor() {
    super(
      QUEUE_NAME,
      async (job) => {
        logger.info({ jobId: job.id }, "Processing export quota reset job");

        try {
          const resetCount = await exportQuotaService.resetExpiredQuotas();

          logger.info(
            { jobId: job.id, resetCount },
            "Export quota reset job completed"
          );
        } catch (error) {
          logger.error({ error, jobId: job.id }, "Export quota reset job failed");
          throw error;
        }
      },
      {
        connection: {
          host: config.REDIS_HOST || "localhost",
          port: config.REDIS_PORT || 6379,
        },
        concurrency: 1, // Process one job at a time
      }
    );

    this.on("completed", (job) => {
      logger.info({ jobId: job.id }, "Export quota reset job completed");
    });

    this.on("failed", (job, error) => {
      logger.error(
        { jobId: job?.id, error },
        "Export quota reset job failed"
      );
    });

    logger.info({}, "Export quota reset worker initialized");
  }
}

// Export singleton instances
export const exportQuotaResetQueue = ExportQuotaResetQueue.getInstance();
export const exportQuotaResetWorker = new ExportQuotaResetWorker();
