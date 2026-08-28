import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { validationService } from "./validation.service.js";

// =============================================================================
// TYPES
// =============================================================================

export type ImportValidationStatus =
  | "pending"
  | "passed"
  | "failed"
  | "applied";

export interface ImportValidationPreview {
  id: string;
  dataType: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  warningCount: number;
  dataQualityScore: number;
  errors: Array<Record<string, unknown>>;
  warnings: Array<Record<string, unknown>>;
  summary: Record<string, unknown>;
  createdBy: string | null;
  applied: boolean;
  createdAt: string;
}

export interface CreatePreviewInput {
  dataType: string;
  rows: Array<Record<string, unknown>>;
  createdBy?: string;
  batchSize?: number;
}

interface Row {
  [key: string]: unknown;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ImportValidationPreviewService {
  /**
   * Validates the incoming rows without persisting them, stores the preview,
   * and returns both the preview record and the raw validation result so the
   * operator can review before committing.
   */
  async createPreview(input: CreatePreviewInput): Promise<ImportValidationPreview> {
    const db = getDatabase();

    if (!input.dataType) {
      throw new Error("dataType is required");
    }
    if (!Array.isArray(input.rows) || input.rows.length === 0) {
      throw new Error("rows must be a non-empty array");
    }
    if (input.rows.length > 20_000) {
      throw new Error("rows exceeds the maximum of 20000");
    }

    const batchResult = await validationService.validateBatch(
      input.rows,
      input.dataType as any,
      {
        dataType: input.dataType,
        operation: "batch",
        // Deliberately NOT admin so that validation rules run in earnest and
        // the preview reflects real data quality instead of the admin bypass.
        isAdmin: false,
        batchSize: input.batchSize ?? 100,
      }
    );

    const rowCount = batchResult.totalItems;
    const validCount = batchResult.validItems;
    const invalidCount = batchResult.invalidItems;
    const warningCount = batchResult.warnings;
    const dataQualityScore = batchResult.summary.dataQualityScore;

    const errors = batchResult.results
      .flatMap((r, index) =>
        r.errors.map((e) => ({ row: index, ...(e as unknown as Record<string, unknown>) }))
      )
      .slice(0, 1000);

    const warnings = batchResult.results
      .flatMap((r, index) =>
        r.warnings.map((w) => ({ row: index, ...(w as unknown as Record<string, unknown>) }))
      )
      .slice(0, 1000);

    const summary: Record<string, unknown> = {
      ...batchResult.summary,
      status: invalidCount === 0 ? "passed" : "failed",
    };

    const [inserted] = await db("import_validation_previews")
      .insert({
        data_type: input.dataType,
        row_count: rowCount,
        valid_count: validCount,
        invalid_count: invalidCount,
        warning_count: warningCount,
        data_quality_score: dataQualityScore,
        errors: JSON.stringify(errors),
        warnings: JSON.stringify(warnings),
        summary: JSON.stringify(summary),
        created_by: input.createdBy ?? null,
        applied: false,
        created_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "import_validation_preview",
        action: "preview_created",
        preview_id: inserted.id,
        data_type: input.dataType,
        row_count: rowCount,
        valid_count: validCount,
        invalid_count: invalidCount,
        data_quality_score: dataQualityScore,
      },
      "Import validation preview created"
    );

    return this.mapRow(inserted as Row);
  }

  async getPreview(id: string): Promise<ImportValidationPreview | null> {
    const db = getDatabase();
    const row = (await db("import_validation_previews")
      .where({ id })
      .first()) as Row | undefined;
    return row ? this.mapRow(row) : null;
  }

  async listPreviews(
    filters?: { dataType?: string; limit?: number }
  ): Promise<ImportValidationPreview[]> {
    const db = getDatabase();
    const rows = (await db("import_validation_previews")
      .modify((qb) => {
        if (filters?.dataType) {
          qb.where("data_type", filters.dataType);
        }
      })
      .orderBy("created_at", "desc")
      .limit(filters?.limit ?? 50)) as Row[];

    return rows.map((row) => this.mapRow(row));
  }

  async countByStatus(): Promise<Record<string, number>> {
    const db = getDatabase();
    const rows = (await db("import_validation_previews")
      .select("data_type")
      .select(db.raw("count(*)::int as cnt"))
      .where("invalid_count", ">", 0)
      .groupBy("data_type")) as Row[];

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[String(row.data_type)] = Number(row.cnt);
    }
    return result;
  }

  private mapRow(row: Row): ImportValidationPreview {
    return {
      id: String(row.id),
      dataType: String(row.data_type),
      rowCount: Number(row.row_count),
      validCount: Number(row.valid_count),
      invalidCount: Number(row.invalid_count),
      warningCount: Number(row.warning_count),
      dataQualityScore: Number(row.data_quality_score),
      errors: this.parseJson(row.errors),
      warnings: this.parseJson(row.warnings),
      summary: this.parseJson(row.summary),
      createdBy: row.created_by ? String(row.created_by) : null,
      applied: Boolean(row.applied),
      createdAt: String(row.created_at),
    };
  }

  private parseJson(value: unknown): any[] {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(String(value));
    } catch {
      return [];
    }
  }
}

export const importValidationPreviewService = new ImportValidationPreviewService();
