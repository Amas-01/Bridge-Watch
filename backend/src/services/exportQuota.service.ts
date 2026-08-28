import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export interface ExportQuota {
  id: string;
  userId: string;
  quotaType: "daily" | "monthly";
  maxExports: number;
  periodStart: Date;
  currentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuotaCheckResult {
  allowed: boolean;
  remaining: number;
  resetsAt: Date;
}

export interface ExportAuditLog {
  id: string;
  userId: string;
  exportType: string;
  recordCount: number;
  exportedAt: Date;
  quotaSnapshot: Record<string, unknown>;
  createdAt: Date;
}

export class QuotaExceededException extends Error {
  constructor(
    message: string,
    public remaining: number,
    public resetsAt: Date
  ) {
    super(message);
    this.name = "QuotaExceededException";
  }
}

// =============================================================================
// EXPORT QUOTA SERVICE
// =============================================================================

export class ExportQuotaService {
  private static instance: ExportQuotaService;

  private constructor() {}

  public static getInstance(): ExportQuotaService {
    if (!ExportQuotaService.instance) {
      ExportQuotaService.instance = new ExportQuotaService();
    }
    return ExportQuotaService.instance;
  }

  /**
   * Check if user has remaining quota without modifying count
   */
  async checkQuota(userId: string, quotaType: "daily" | "monthly"): Promise<QuotaCheckResult> {
    logger.debug({ userId, quotaType }, "Checking export quota");

    const db = getDatabase();
    const periodStart = this.getPeriodStart(quotaType);

    const quota = await db("export_quotas")
      .where({ user_id: userId, quota_type: quotaType, period_start: periodStart })
      .first();

    if (!quota) {
      // No quota set - create default quota
      const defaultMaxExports = quotaType === "daily" ? 10 : 100;
      await db("export_quotas").insert({
        user_id: userId,
        quota_type: quotaType,
        max_exports: defaultMaxExports,
        period_start: periodStart,
        current_count: 0,
      });

      return {
        allowed: true,
        remaining: defaultMaxExports,
        resetsAt: this.getResetTime(quotaType, periodStart),
      };
    }

    const remaining = quota.max_exports - quota.current_count;
    const allowed = remaining > 0;

    return {
      allowed,
      remaining: Math.max(0, remaining),
      resetsAt: this.getResetTime(quotaType, periodStart),
    };
  }

  /**
   * Increment export count atomically - throws QuotaExceededException if limit reached
   */
  async incrementExport(
    userId: string,
    exportType: string,
    recordCount: number
  ): Promise<void> {
    logger.info({ userId, exportType, recordCount }, "Incrementing export quota");

    const db = getDatabase();

    await db.transaction(async (trx) => {
      // Use daily quota for now (can be configurable per user)
      const quotaType = "daily";
      const periodStart = this.getPeriodStart(quotaType);

      // Lock the row for update to prevent race conditions
      const quota = await trx("export_quotas")
        .where({ user_id: userId, quota_type: quotaType, period_start: periodStart })
        .forUpdate()
        .first();

      if (!quota) {
        // Create default quota if not exists
        const defaultMaxExports = 10;
        await trx("export_quotas").insert({
          user_id: userId,
          quota_type: quotaType,
          max_exports: defaultMaxExports,
          period_start: periodStart,
          current_count: 0,
        });

        // Re-fetch with lock
        const newQuota = await trx("export_quotas")
          .where({ user_id: userId, quota_type: quotaType, period_start: periodStart })
          .forUpdate()
          .first();

        if (!newQuota) {
          throw new Error("Failed to create export quota");
        }

        // Check limit
        if (newQuota.current_count + 1 > newQuota.max_exports) {
          throw new QuotaExceededException(
            "Export quota exceeded",
            0,
            this.getResetTime(quotaType, periodStart)
          );
        }

        // Increment
        await trx("export_quotas")
          .where({ id: newQuota.id })
          .update({
            current_count: trx.raw("current_count + 1"),
            updated_at: new Date(),
          });

        // Log to audit
        await trx("export_audit_log").insert({
          user_id: userId,
          export_type: exportType,
          record_count: recordCount,
          exported_at: new Date(),
          quota_snapshot: JSON.stringify({
            quotaType,
            maxExports: newQuota.max_exports,
            currentCount: newQuota.current_count + 1,
            periodStart,
          }),
        });

        logger.info({ userId, quotaType }, "Export quota incremented (new quota)");
        return;
      }

      // Check if limit would be exceeded
      if (quota.current_count + 1 > quota.max_exports) {
        throw new QuotaExceededException(
          "Export quota exceeded",
          0,
          this.getResetTime(quotaType, periodStart)
        );
      }

      // Increment atomically
      await trx("export_quotas")
        .where({ id: quota.id })
        .update({
          current_count: trx.raw("current_count + 1"),
          updated_at: new Date(),
        });

      // Log to audit
      await trx("export_audit_log").insert({
        user_id: userId,
        export_type: exportType,
        record_count: recordCount,
        exported_at: new Date(),
        quota_snapshot: JSON.stringify({
          quotaType,
          maxExports: quota.max_exports,
          currentCount: quota.current_count + 1,
          periodStart,
        }),
      });

      logger.info({ userId, quotaType, newCount: quota.current_count + 1 }, "Export quota incremented");
    });
  }

  /**
   * Reset expired quotas (called by scheduled job)
   */
  async resetExpiredQuotas(): Promise<number> {
    logger.info({}, "Resetting expired export quotas");

    const db = getDatabase();
    const now = new Date();

    // Reset daily quotas older than today
    const dailyPeriodStart = this.getPeriodStart("daily");
    const dailyReset = await db("export_quotas")
      .where("quota_type", "daily")
      .where("period_start", "<", dailyPeriodStart)
      .update({
        current_count: 0,
        period_start: dailyPeriodStart,
        updated_at: now,
      });

    // Reset monthly quotas older than this month
    const monthlyPeriodStart = this.getPeriodStart("monthly");
    const monthlyReset = await db("export_quotas")
      .where("quota_type", "monthly")
      .where("period_start", "<", monthlyPeriodStart)
      .update({
        current_count: 0,
        period_start: monthlyPeriodStart,
        updated_at: now,
      });

    const totalReset = dailyReset + monthlyReset;

    logger.info(
      { dailyReset, monthlyReset, totalReset },
      "Expired quotas reset completed"
    );

    return totalReset;
  }

  /**
   * Set or update user quota (admin only)
   */
  async setUserQuota(
    userId: string,
    params: { quotaType: "daily" | "monthly"; maxExports: number },
    adminId: string
  ): Promise<ExportQuota> {
    logger.info({ userId, params, adminId }, "Setting user export quota");

    const db = getDatabase();
    const periodStart = this.getPeriodStart(params.quotaType);

    const existing = await db("export_quotas")
      .where({ user_id: userId, quota_type: params.quotaType, period_start: periodStart })
      .first();

    if (existing) {
      // Update existing quota
      const [updated] = await db("export_quotas")
        .where({ id: existing.id })
        .update({
          max_exports: params.maxExports,
          updated_at: new Date(),
        })
        .returning("*");

      logger.info({ userId, quotaType: params.quotaType }, "User quota updated");
      return this.mapQuotaRow(updated);
    } else {
      // Create new quota
      const [inserted] = await db("export_quotas")
        .insert({
          user_id: userId,
          quota_type: params.quotaType,
          max_exports: params.maxExports,
          period_start: periodStart,
          current_count: 0,
        })
        .returning("*");

      logger.info({ userId, quotaType: params.quotaType }, "User quota created");
      return this.mapQuotaRow(inserted);
    }
  }

  /**
   * Get all quotas for a user
   */
  async getUserQuotas(userId: string): Promise<ExportQuota[]> {
    logger.debug({ userId }, "Fetching user export quotas");

    const db = getDatabase();
    const rows = await db("export_quotas")
      .where({ user_id: userId })
      .orderBy("quota_type", "asc");

    return rows.map(this.mapQuotaRow);
  }

  /**
   * Get all user quotas (admin only)
   */
  async getAllUserQuotas(): Promise<ExportQuota[]> {
    logger.debug({}, "Fetching all user export quotas");

    const db = getDatabase();
    const rows = await db("export_quotas").orderBy("user_id", "asc");

    return rows.map(this.mapQuotaRow);
  }

  /**
   * Get period start date for quota type
   */
  private getPeriodStart(quotaType: "daily" | "monthly"): Date {
    const now = new Date();

    if (quotaType === "daily") {
      // Start of today (UTC)
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    } else {
      // Start of this month (UTC)
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    }
  }

  /**
   * Get reset time for quota period
   */
  private getResetTime(quotaType: "daily" | "monthly", periodStart: Date): Date {
    const start = new Date(periodStart);

    if (quotaType === "daily") {
      // Next day
      start.setUTCDate(start.getUTCDate() + 1);
    } else {
      // Next month
      start.setUTCMonth(start.getUTCMonth() + 1);
    }

    return start;
  }

  /**
   * Map database row to ExportQuota type
   */
  private mapQuotaRow(row: Record<string, unknown>): ExportQuota {
    return {
      id: row.id as string,
      userId: row.user_id as string,
      quotaType: row.quota_type as "daily" | "monthly",
      maxExports: row.max_exports as number,
      periodStart: row.period_start as Date,
      currentCount: row.current_count as number,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

export const exportQuotaService = ExportQuotaService.getInstance();
