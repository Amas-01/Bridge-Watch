import { Queue, Worker } from "bullmq";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { rpcCapabilityDiscoveryService } from "../services/rpcCapabilityDiscovery.service.js";

const QUEUE_NAME = "rpc-capability-refresh-queue";
const JOB_NAME = "refresh-rpc-capabilities";

// =============================================================================
// RPC CAPABILITY REFRESH QUEUE
// =============================================================================

export class RpcCapabilityRefreshQueue extends Queue {
  private static instance: RpcCapabilityRefreshQueue;

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

    logger.info({}, "RPC capability refresh queue initialized");
  }

  public static getInstance(): RpcCapabilityRefreshQueue {
    if (!RpcCapabilityRefreshQueue.instance) {
      RpcCapabilityRefreshQueue.instance = new RpcCapabilityRefreshQueue();
    }
    return RpcCapabilityRefreshQueue.instance;
  }

  /**
   * Schedule periodic refresh for all known RPC endpoints
   */
  async schedulePeriodicRefresh(): Promise<void> {
    // Schedule job to run every 6 hours
    await this.add(
      JOB_NAME,
      {},
      {
        repeat: {
          pattern: "0 */6 * * *", // Every 6 hours
        },
        jobId: "periodic-rpc-capability-refresh",
      }
    );

    logger.info({}, "Periodic RPC capability refresh scheduled (every 6 hours)");
  }

  /**
   * Trigger immediate refresh for a specific endpoint
   */
  async triggerRefresh(endpointUrl: string): Promise<void> {
    await this.add(JOB_NAME, { endpointUrl });
    logger.info({ endpointUrl }, "RPC capability refresh job enqueued");
  }
}

// =============================================================================
// RPC CAPABILITY REFRESH WORKER
// =============================================================================

export class RpcCapabilityRefreshWorker extends Worker {
  constructor() {
    super(
      QUEUE_NAME,
      async (job) => {
        logger.info({ jobId: job.id }, "Processing RPC capability refresh job");

        try {
          const { endpointUrl } = job.data;

          if (endpointUrl) {
            // Refresh specific endpoint
            logger.info({ endpointUrl }, "Refreshing capabilities for specific endpoint");
            await rpcCapabilityDiscoveryService.refreshCapabilities(endpointUrl);
          } else {
            // Refresh all known endpoints
            logger.info({}, "Refreshing capabilities for all known endpoints");
            const endpoints = await rpcCapabilityDiscoveryService.getAllEndpoints();

            for (const endpoint of endpoints) {
              try {
                await rpcCapabilityDiscoveryService.refreshCapabilities(endpoint);
                logger.info({ endpoint }, "Endpoint capabilities refreshed");
              } catch (error) {
                logger.error(
                  { error, endpoint },
                  "Failed to refresh endpoint capabilities"
                );
              }
            }

            logger.info(
              { totalEndpoints: endpoints.length },
              "All endpoint capabilities refreshed"
            );
          }
        } catch (error) {
          logger.error({ error, jobId: job.id }, "RPC capability refresh job failed");
          throw error;
        }
      },
      {
        connection: {
          host: config.REDIS_HOST || "localhost",
          port: config.REDIS_PORT || 6379,
        },
        concurrency: 1, // Process one job at a time to avoid overwhelming RPC endpoints
      }
    );

    this.on("completed", (job) => {
      logger.info({ jobId: job.id }, "RPC capability refresh job completed");
    });

    this.on("failed", (job, error) => {
      logger.error(
        { jobId: job?.id, error },
        "RPC capability refresh job failed"
      );
    });

    logger.info({}, "RPC capability refresh worker initialized");
  }
}

// Export singleton instances
export const rpcCapabilityRefreshQueue = RpcCapabilityRefreshQueue.getInstance();
export const rpcCapabilityRefreshWorker = new RpcCapabilityRefreshWorker();
