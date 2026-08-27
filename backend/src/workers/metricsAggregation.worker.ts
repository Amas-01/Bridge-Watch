import { Job } from "bullmq";
import { metricsAggregationService, type MetricGranularity } from "../services/metricsAggregation.service.js";
import { logger } from "../utils/logger.js";
import { ingestionWatermarkCoordinator } from "../services/ingestionWatermarkCoordinator.service.js";

/**
 * Worker that rolls up raw metric data points into multi-level summaries
 * (hourly -> daily -> weekly) and prunes data per the retention policy.
 */
export async function processMetricsAggregation(job: Job) {
  const { type, watermarkConsumer } = job.data as { type: "hourly" | "daily" | "weekly" | "retention"; watermarkConsumer?: string };

  logger.info({ jobId: job.id, type }, "Starting metrics aggregation job");

  try {
    // A rollup can opt into explicit source barriers instead of assuming the
    // wall-clock schedule means every input source has caught up.
    if (watermarkConsumer) {
      const window = await ingestionWatermarkCoordinator.inspect(watermarkConsumer);
      if (window.through === null) {
        logger.warn({ watermarkConsumer, blocked: window.blocked }, "Metrics rollup deferred by ingestion barrier");
        return { success: true, deferred: true, window };
      }
      logger.info({ watermarkConsumer, through: window.through, explain: window.explain }, "Metrics rollup bounded by ingestion watermark");
    }
    if (type === "retention") {
      const deleted = await metricsAggregationService.applyRetentionPolicies();
      logger.info({ deleted }, "Completed metrics retention cleanup");
      return { success: true, deleted };
    }

    const granularity = type as MetricGranularity;
    const windows = await metricsAggregationService.runRollup(granularity);
    logger.info({ granularity, windows }, "Completed metrics rollup");
    return { success: true, windows };
  } catch (error) {
    logger.error({ error, jobId: job.id }, "Metrics aggregation job failed");
    throw error;
  }
}
