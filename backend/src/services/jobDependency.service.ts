import { Knex } from "knex";
import {
  JobDependencyModel,
  JobExecution,
} from "../database/models/JobDependency.js";
import logger from "../utils/logger.js";

export class JobDependencyService {
  private model: JobDependencyModel;

  constructor(private db: Knex) {
    this.model = new JobDependencyModel(db);
  }

  async cancelJobExecution(
    executionId: string,
    reason: string,
    cancelledBy: string,
    cascadeToDependent: boolean = true,
  ): Promise<{ cancelled: string[]; failed: string[] }> {
    const execution = await this.model.getExecutionByExecutionId(executionId);

    if (!execution) {
      throw new Error(`Execution ${executionId} not found`);
    }

    if (execution.status === "cancelled" || execution.status === "completed") {
      throw new Error(
        `Cannot cancel execution with status: ${execution.status}`,
      );
    }

    const cancelled: string[] = [execution.id];
    const failed: string[] = [];

    await this.model.updateExecution(execution.id, {
      status: "cancelled",
      completed_at: new Date(),
      error_message: `Cancelled: ${reason}`,
    });

    logger.info({ executionId, reason }, "Cancelled job execution");

    if (cascadeToDependent) {
      const dependents = await this.model.getRunningDependentExecutions(
        execution.job_definition_id,
      );

      for (const dependent of dependents) {
        try {
          await this.model.updateExecution(dependent.id, {
            status: "cancelled",
            completed_at: new Date(),
            error_message: `Cancelled due to dependency cancellation: ${executionId}`,
          });
          cancelled.push(dependent.id);
          logger.info(
            { dependentId: dependent.id, parentId: executionId },
            "Cascaded cancellation to dependent job",
          );
        } catch (error: any) {
          failed.push(dependent.id);
          logger.error(
            { dependentId: dependent.id, error: error.message },
            "Failed to cancel dependent job",
          );
        }
      }
    }

    await this.model.createCancellation({
      job_execution_id: execution.id,
      cancellation_reason: reason,
      cancelled_by: cancelledBy,
      cascade_to_dependents: cascadeToDependent,
      affected_jobs: cancelled,
      cancelled_at: new Date(),
    });

    return { cancelled, failed };
  }

  async getExecutionStatus(executionId: string): Promise<JobExecution | null> {
    const execution = await this.model.getExecutionByExecutionId(executionId);
    return execution || null;
  }

  async getExecutionDependencies(executionId: string): Promise<any[]> {
    const execution = await this.model.getExecutionByExecutionId(executionId);

    if (!execution) {
      return [];
    }

    const dependencies = await this.model.getDependencies(
      execution.job_definition_id,
    );
    return dependencies;
  }

  async checkDependenciesComplete(jobDefinitionId: string): Promise<boolean> {
    const dependencies = await this.model.getDependencies(jobDefinitionId);

    for (const dep of dependencies) {
      if (dep.dependency_type === "blocking") {
        const depExecutions = await this.model.getExecutionByExecutionId(
          dep.depends_on_job_id,
        );
        if (!depExecutions || depExecutions.status !== "completed") {
          return false;
        }
      }
    }

    return true;
  }
}
