import type { Job } from "bullmq";
import { logger } from "../utils/logger.js";
import { providerCredentialRotationService } from "../services/providerCredentialRotation.service.js";

export async function processProviderCredentialRotation(job: Job): Promise<void> {
  logger.info({ jobId: job.id }, "Starting provider credential rotation scheduler job");

  try {
    const result = await providerCredentialRotationService.runRotationScheduler();
    logger.info(
      {
        jobId: job.id,
        totalCredentials: result.totalCredentials,
        candidates: result.candidates.length,
        succeeded: result.results.filter((r) => r.success).length,
        failed: result.results.filter((r) => !r.success).length,
      },
      "Provider credential rotation scheduler job completed"
    );
  } catch (error) {
    logger.error({ jobId: job.id, error }, "Provider credential rotation scheduler job failed");
    throw error;
  }
}
