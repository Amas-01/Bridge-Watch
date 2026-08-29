import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import type {
  ComplianceRetentionExceptionRecord,
  RetentionExceptionTargetType,
  RetentionExceptionStatus,
} from "../database/types.js";

export interface CreateExceptionInput {
  exceptionCode: string;
  title: string;
  reason: string;
  requestedBy: string;
  targetType: RetentionExceptionTargetType;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
}

export class ComplianceRetentionExceptionService {
  private readonly db = getDatabase();

  async createException(input: CreateExceptionInput): Promise<ComplianceRetentionExceptionRecord> {
    const existing = await this.db("compliance_retention_exceptions")
      .where({ exception_code: input.exceptionCode })
      .first();

    if (existing) {
      throw new Error(`Exception code '${input.exceptionCode}' already exists`);
    }

    const [record] = await this.db("compliance_retention_exceptions")
      .insert({
        exception_code: input.exceptionCode,
        title: input.title,
        reason: input.reason,
        requested_by: input.requestedBy,
        target_type: input.targetType,
        target_id: input.targetId ?? null,
        start_date: input.startDate ?? new Date(),
        end_date: input.endDate ?? null,
        status: "active",
      })
      .returning("*");

    logger.info(
      { exceptionId: record.id, code: input.exceptionCode, targetType: input.targetType },
      "Created compliance retention exception"
    );

    return record;
  }

  async releaseException(
    id: string,
    releasedBy: string,
    releaseReason?: string
  ): Promise<ComplianceRetentionExceptionRecord> {
    const existing = await this.getException(id);
    if (!existing) throw new Error("Retention exception not found");
    if (existing.status !== "active") throw new Error("Retention exception is already inactive");

    const now = new Date();
    await this.db("compliance_retention_exceptions")
      .where({ id })
      .update({
        status: "released",
        released_by: releasedBy,
        released_at: now,
        release_reason: releaseReason ?? null,
        updated_at: now,
      });

    logger.info({ exceptionId: id, releasedBy }, "Released compliance retention exception");
    const updated = await this.getException(id);
    return updated!;
  }

  async getException(id: string): Promise<ComplianceRetentionExceptionRecord | undefined> {
    return this.db("compliance_retention_exceptions").where({ id }).first();
  }

  async listExceptions(options?: {
    status?: RetentionExceptionStatus;
    targetType?: RetentionExceptionTargetType;
    limit?: number;
  }): Promise<ComplianceRetentionExceptionRecord[]> {
    const query = this.db("compliance_retention_exceptions")
      .orderBy("created_at", "desc")
      .limit(options?.limit ?? 50);

    if (options?.status) {
      query.where({ status: options.status });
    }

    if (options?.targetType) {
      query.where({ target_type: options.targetType });
    }

    return query;
  }

  async isProtectedFromCleanup(targetType: string, targetId?: string): Promise<boolean> {
    const now = new Date();
    const query = this.db("compliance_retention_exceptions")
      .where({ status: "active" })
      .where("start_date", "<=", now)
      .where((builder) => {
        builder.whereNull("end_date").orWhere("end_date", ">=", now);
      })
      .where((builder) => {
        builder.where({ target_type: "all" })
          .orWhere({ target_type: targetType });
      });

    if (targetId) {
      query.where((builder) => {
        builder.whereNull("target_id").orWhere({ target_id: targetId });
      });
    }

    const matches = await query;
    return matches.length > 0;
  }
}
