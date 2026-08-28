import { Queue, Worker } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { tokenDecimalDetectionService } from "../services/tokenDecimalDetection.service.js";

const QUEUE_NAME = "token-decimal-snapshot-queue";
const JOB_NAME = "snapshot-token-decimals";

// Default tokens to monitor (can be configured via environment or database)
const DEFAULT_MONITORED_TOKENS = [
  // Ethereum mainnet (chain ID 1)
  { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", chainId: "1" }, // USDC
  { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", chainId: "1" }, // USDT
  { address: "0x1aBaEA1f7df457398a0d4E980050846c85198C54", chainId: "1" }, // EURC
];

interface TokenSnapshotJobData {
  tokens?: Array<{ address: string; chainId: string }>;
}

// =============================================================================
// TOKEN DECIMAL SNAPSHOT QUEUE
// =============================================================================

export class TokenDecimalSnapshotQueue extends Queue<TokenSnapshotJobData> {
  private static instance: TokenDecimalSnapshotQueue;

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
          delay: 10000,
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

    logger.info({}, "Token decimal snapshot queue initialized");
  }

  public static getInstance(): TokenDecimalSnapshotQueue {
    if (!TokenDecimalSnapshotQueue.instance) {
      TokenDecimalSnapshotQueue.instance = new TokenDecimalSnapshotQueue();
    }
    return TokenDecimalSnapshotQueue.instance;
  }

  /**
   * Schedule periodic snapshots for monitored tokens
   */
  async schedulePeriodicSnapshot(): Promise<void> {
    // Schedule job to run every 12 hours
    await this.add(
      JOB_NAME,
      { tokens: DEFAULT_MONITORED_TOKENS },
      {
        repeat: {
          pattern: "0 */12 * * *", // Every 12 hours
        },
        jobId: "periodic-token-decimal-snapshot",
      }
    );

    logger.info(
      { tokensCount: DEFAULT_MONITORED_TOKENS.length },
      "Periodic token decimal snapshot scheduled (every 12 hours)"
    );
  }

  /**
   * Trigger immediate snapshot for specific tokens
   */
  async triggerSnapshot(tokens: Array<{ address: string; chainId: string }>): Promise<void> {
    await this.add(JOB_NAME, { tokens });
    logger.info({ tokensCount: tokens.length }, "Token decimal snapshot job enqueued");
  }
}

// =============================================================================
// TOKEN DECIMAL SNAPSHOT WORKER
// =============================================================================

export class TokenDecimalSnapshotWorker extends Worker<TokenSnapshotJobData> {
  constructor() {
    super(
      QUEUE_NAME,
      async (job) => {
        logger.info({ jobId: job.id }, "Processing token decimal snapshot job");

        try {
          const tokens = job.data.tokens || DEFAULT_MONITORED_TOKENS;

          logger.info({ tokensCount: tokens.length }, "Starting token decimal snapshots");

          await tokenDecimalDetectionService.snapshotTokenDecimals(tokens);

          logger.info(
            { tokensCount: tokens.length },
            "Token decimal snapshots completed"
          );
        } catch (error) {
          logger.error({ error, jobId: job.id }, "Token decimal snapshot job failed");
          throw error;
        }
      },
      {
        connection: {
          host: config.REDIS_HOST || "localhost",
          port: config.REDIS_PORT || 6379,
        },
        concurrency: 1, // Process one job at a time to avoid rate limits
      }
    );

    this.on("completed", (job) => {
      logger.info({ jobId: job.id }, "Token decimal snapshot job completed");
    });

    this.on("failed", (job, error) => {
      logger.error(
        { jobId: job?.id, error },
        "Token decimal snapshot job failed"
      );
    });

    logger.info({}, "Token decimal snapshot worker initialized");
  }
}

// Export singleton instances
export const tokenDecimalSnapshotQueue = TokenDecimalSnapshotQueue.getInstance();
export const tokenDecimalSnapshotWorker = new TokenDecimalSnapshotWorker();
