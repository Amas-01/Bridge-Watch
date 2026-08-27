import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export type ErrorSeverity = "info" | "warning" | "error" | "critical";
export type ErrorCategory =
  | "network"
  | "auth"
  | "validation"
  | "bridge"
  | "rate_limit"
  | "internal";

export interface ErrorCatalogEntry {
  id: string;
  errorCode: string;
  title: string;
  messageTemplate: string;
  httpStatus: number;
  severity: ErrorSeverity;
  category: ErrorCategory;
  retryGuidance: string | null;
  documentationUrl: string | null;
  isActive: boolean;
  createdBy: string;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCatalogEntryParams {
  errorCode: string;
  title: string;
  messageTemplate: string;
  httpStatus: number;
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  retryGuidance?: string;
  documentationUrl?: string;
  createdBy: string;
}

export interface UpdateCatalogEntryParams {
  title?: string;
  messageTemplate?: string;
  httpStatus?: number;
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  retryGuidance?: string;
  documentationUrl?: string;
}

export interface ListEntriesFilter {
  severity?: ErrorSeverity;
  category?: ErrorCategory;
  includeInactive?: boolean;
}

/** A fully-rendered error response enriched from the catalog. */
export interface EnrichedErrorResponse {
  error: string;
  message: string;
  errorCode: string;
  httpStatus: number;
  severity: ErrorSeverity;
  category: ErrorCategory;
  retryGuidance: string | null;
  documentationUrl: string | null;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ErrorCatalogService {
  private static instance: ErrorCatalogService;

  private constructor() {}

  public static getInstance(): ErrorCatalogService {
    if (!ErrorCatalogService.instance) {
      ErrorCatalogService.instance = new ErrorCatalogService();
    }
    return ErrorCatalogService.instance;
  }

  // ---------------------------------------------------------------------------
  // LOOKUP
  // ---------------------------------------------------------------------------

  /**
   * Looks up a catalog entry by its stable error code.
   * Returns null when no active entry exists for the given code.
   */
  public async getCatalogEntry(
    errorCode: string
  ): Promise<ErrorCatalogEntry | null> {
    const db = getDatabase();
    const row = await db("error_catalog")
      .where("error_code", errorCode)
      .where("is_active", true)
      .first();
    return row ? this.mapRow(row) : null;
  }

  /**
   * Returns all catalog entries with optional filtering by severity or category.
   * Inactive entries are excluded by default unless includeInactive is set.
   */
  public async listEntries(
    filter: ListEntriesFilter = {}
  ): Promise<ErrorCatalogEntry[]> {
    const db = getDatabase();
    let query = db("error_catalog").orderBy("category").orderBy("error_code");

    if (!filter.includeInactive) {
      query = query.where("is_active", true);
    }
    if (filter.severity) {
      query = query.where("severity", filter.severity);
    }
    if (filter.category) {
      query = query.where("category", filter.category);
    }

    const rows = await query;
    return rows.map(this.mapRow);
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * Creates a new catalog entry. Validates error_code uniqueness across all
   * entries (including inactive) to prevent duplicate codes being reactivated
   * with different semantics.
   * @throws Error when error_code already exists.
   */
  public async createEntry(
    params: CreateCatalogEntryParams
  ): Promise<ErrorCatalogEntry> {
    const db = getDatabase();

    // Check uniqueness including inactive entries
    const existing = await db("error_catalog")
      .where("error_code", params.errorCode)
      .first();

    if (existing) {
      throw new Error(
        `Error code already exists: ${params.errorCode}. ` +
          `Reactivate the existing entry via PATCH /:id if needed.`
      );
    }

    const [row] = await db("error_catalog")
      .insert({
        id: crypto.randomUUID(),
        error_code: params.errorCode,
        title: params.title,
        message_template: params.messageTemplate,
        http_status: params.httpStatus,
        severity: params.severity ?? "error",
        category: params.category ?? "internal",
        retry_guidance: params.retryGuidance ?? null,
        documentation_url: params.documentationUrl ?? null,
        is_active: true,
        created_by: params.createdBy,
        updated_by: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "error_catalog",
        action: "entry_created",
        actor: params.createdBy,
        resource_id: row.id,
        error_code: params.errorCode,
      },
      "Error catalog entry created"
    );

    return this.mapRow(row);
  }

  /**
   * Updates an existing catalog entry. Returns the updated entry.
   * @throws Error when the entry is not found.
   */
  public async updateEntry(
    id: string,
    params: UpdateCatalogEntryParams,
    updatedBy: string
  ): Promise<ErrorCatalogEntry> {
    const db = getDatabase();
    const updateData: Record<string, unknown> = {
      updated_by: updatedBy,
      updated_at: new Date(),
    };

    if (params.title !== undefined) updateData.title = params.title;
    if (params.messageTemplate !== undefined)
      updateData.message_template = params.messageTemplate;
    if (params.httpStatus !== undefined)
      updateData.http_status = params.httpStatus;
    if (params.severity !== undefined) updateData.severity = params.severity;
    if (params.category !== undefined) updateData.category = params.category;
    if ("retryGuidance" in params)
      updateData.retry_guidance = params.retryGuidance ?? null;
    if ("documentationUrl" in params)
      updateData.documentation_url = params.documentationUrl ?? null;

    const [row] = await db("error_catalog")
      .where("id", id)
      .update(updateData)
      .returning("*");

    if (!row) {
      throw new Error(`Error catalog entry not found: ${id}`);
    }

    logger.info(
      {
        feature: "error_catalog",
        action: "entry_updated",
        actor: updatedBy,
        resource_id: id,
      },
      "Error catalog entry updated"
    );

    return this.mapRow(row);
  }

  /**
   * Soft-deactivates a catalog entry (sets is_active=false).
   * The entry is retained for historical reference but excluded from lookups.
   * @throws Error when the entry is not found.
   */
  public async deactivateEntry(id: string, updatedBy: string): Promise<void> {
    const db = getDatabase();
    const [row] = await db("error_catalog")
      .where("id", id)
      .update({
        is_active: false,
        updated_by: updatedBy,
        updated_at: new Date(),
      })
      .returning("id");

    if (!row) {
      throw new Error(`Error catalog entry not found: ${id}`);
    }

    logger.info(
      {
        feature: "error_catalog",
        action: "entry_deactivated",
        actor: updatedBy,
        resource_id: id,
      },
      "Error catalog entry deactivated"
    );
  }

  // ---------------------------------------------------------------------------
  // ENRICHMENT
  // ---------------------------------------------------------------------------

  /**
   * Builds a fully-rendered error response from a catalog entry and template params.
   *
   * Template substitution: replaces `{param_name}` placeholders in
   * message_template with values from the params object.
   *
   * Example:
   *   template: "Operation failed after {retries} retries on {bridge}"
   *   params: { retries: 3, bridge: "Circle USDC" }
   *   result: "Operation failed after 3 retries on Circle USDC"
   *
   * Returns null when no active catalog entry exists for the given code.
   */
  public async enrichError(
    errorCode: string,
    params: Record<string, unknown> = {}
  ): Promise<EnrichedErrorResponse | null> {
    const entry = await this.getCatalogEntry(errorCode);
    if (!entry) return null;

    const message = this.applyTemplate(entry.messageTemplate, params);

    return {
      error: entry.title,
      message,
      errorCode: entry.errorCode,
      httpStatus: entry.httpStatus,
      severity: entry.severity,
      category: entry.category,
      retryGuidance: entry.retryGuidance,
      documentationUrl: entry.documentationUrl,
    };
  }

  /**
   * Applies template parameter substitution. Replaces `{key}` tokens with
   * the stringified value from params. Unmatched tokens are left as-is.
   */
  public applyTemplate(
    template: string,
    params: Record<string, unknown>
  ): string {
    return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
      return key in params ? String(params[key]) : `{${key}}`;
    });
  }

  // ---------------------------------------------------------------------------
  // MAPPER
  // ---------------------------------------------------------------------------

  private mapRow(row: Record<string, unknown>): ErrorCatalogEntry {
    return {
      id: row.id as string,
      errorCode: row.error_code as string,
      title: row.title as string,
      messageTemplate: row.message_template as string,
      httpStatus: row.http_status as number,
      severity: row.severity as ErrorSeverity,
      category: row.category as ErrorCategory,
      retryGuidance: (row.retry_guidance as string) ?? null,
      documentationUrl: (row.documentation_url as string) ?? null,
      isActive: row.is_active as boolean,
      createdBy: row.created_by as string,
      updatedBy: (row.updated_by as string) ?? null,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

export const errorCatalogService = ErrorCatalogService.getInstance();
