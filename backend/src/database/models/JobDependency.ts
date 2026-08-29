import { Knex } from "knex";

export interface JobDefinition {
  id: string;
  job_name: string;
  job_type: string;
  description?: string;
  config: Record<string, any>;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface JobDependency {
  id: string;
  job_id: string;
  depends_on_job_id: string;
  dependency_type: "blocking" | "soft";
  created_at: Date;
}

export interface JobExecution {
  id: string;
  job_definition_id: string;
  execution_id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
  input_params: Record<string, any>;
  output_result: Record<string, any>;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface JobCancellation {
  id: string;
  job_execution_id: string;
  cancellation_reason: string;
  cancelled_by?: string;
  cascade_to_dependents: boolean;
  affected_jobs: string[];
  cancelled_at: Date;
  created_at: Date;
}

export class JobDependencyModel {
  constructor(private db: Knex) {}

  async createJobDefinition(
    job: Omit<JobDefinition, "id" | "created_at" | "updated_at">,
  ): Promise<JobDefinition> {
    const [created] = await this.db("job_definitions")
      .insert(job)
      .returning("*");
    return created;
  }

  async getJobDefinitionByName(
    jobName: string,
  ): Promise<JobDefinition | undefined> {
    return await this.db("job_definitions")
      .where({ job_name: jobName })
      .first();
  }

  async createDependency(
    dependency: Omit<JobDependency, "id" | "created_at">,
  ): Promise<JobDependency> {
    const [created] = await this.db("job_dependencies")
      .insert(dependency)
      .returning("*");
    return created;
  }

  async getDependencies(jobId: string): Promise<JobDependency[]> {
    return await this.db("job_dependencies").where({ job_id: jobId });
  }

  async getDependents(jobId: string): Promise<JobDependency[]> {
    return await this.db("job_dependencies").where({
      depends_on_job_id: jobId,
    });
  }

  async createExecution(
    execution: Omit<JobExecution, "id" | "created_at" | "updated_at">,
  ): Promise<JobExecution> {
    const [created] = await this.db("job_executions")
      .insert(execution)
      .returning("*");
    return created;
  }

  async updateExecution(
    id: string,
    updates: Partial<JobExecution>,
  ): Promise<JobExecution> {
    const [updated] = await this.db("job_executions")
      .where({ id })
      .update({ ...updates, updated_at: new Date() })
      .returning("*");
    return updated;
  }

  async getExecutionById(id: string): Promise<JobExecution | undefined> {
    return await this.db("job_executions").where({ id }).first();
  }

  async getExecutionByExecutionId(
    executionId: string,
  ): Promise<JobExecution | undefined> {
    return await this.db("job_executions")
      .where({ execution_id: executionId })
      .first();
  }

  async createCancellation(
    cancellation: Omit<JobCancellation, "id" | "created_at">,
  ): Promise<JobCancellation> {
    const [created] = await this.db("job_cancellations")
      .insert(cancellation)
      .returning("*");
    return created;
  }

  async getCancellationByExecutionId(
    executionId: string,
  ): Promise<JobCancellation | undefined> {
    return await this.db("job_cancellations")
      .where({ job_execution_id: executionId })
      .first();
  }

  async getRunningDependentExecutions(
    jobDefinitionId: string,
  ): Promise<JobExecution[]> {
    const dependents = await this.db("job_dependencies")
      .where({ depends_on_job_id: jobDefinitionId })
      .select("job_id");

    const dependentJobIds = dependents.map((d) => d.job_id);

    if (dependentJobIds.length === 0) return [];

    return await this.db("job_executions")
      .whereIn("job_definition_id", dependentJobIds)
      .whereIn("status", ["pending", "running"]);
  }
}
