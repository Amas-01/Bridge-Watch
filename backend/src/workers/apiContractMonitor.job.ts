import type { Job } from "bullmq";
import { logger } from "../utils/logger.js";
import { apiContractMonitorService } from "../services/apiContractMonitor.service.js";

export async function processApiContractMonitor(job: Job): Promise<void> {
  logger.info({ jobId: job.id }, "Starting API contract monitor job");

  try {
    const result = await apiContractMonitorService.runAllChecks();
    logger.info(
      {
        jobId: job.id,
        checked: result.checked,
        driftsDetected: result.driftsDetected,
        breakingChanges: result.breakingChanges,
      },
      "API contract monitor job completed"
    );
  } catch (error) {
    logger.error({ jobId: job.id, error }, "API contract monitor job failed");
    throw error;
  }
}
