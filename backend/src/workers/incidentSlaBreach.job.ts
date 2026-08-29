import type { Job } from "bullmq";
import { logger } from "../utils/logger.js";
import { incidentSlaBreachService } from "../services/incidentSlaBreach.service.js";

export async function processIncidentSlaBreach(job: Job): Promise<void> {
  logger.info({ jobId: job.id }, "Starting incident SLA breach detection job");

  try {
    const result = await incidentSlaBreachService.checkSlaBreaches();
    logger.info(
      {
        jobId: job.id,
        openIncidentsChecked: result.openIncidentsChecked,
        totalBreaches: result.breaches.length,
        critical: result.breaches.filter((b) => b.breachLevel === "critical").length,
        warning: result.breaches.filter((b) => b.breachLevel === "warning").length,
      },
      "Incident SLA breach detection job completed"
    );
  } catch (error) {
    logger.error({ jobId: job.id, error }, "Incident SLA breach detection job failed");
    throw error;
  }
}
