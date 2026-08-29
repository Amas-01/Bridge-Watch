import crypto from "crypto";
import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

// =============================================================================
// TYPES
// =============================================================================

export type ChangeRequestStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "applied"
  | "cancelled";

export type ChangeType =
  | "config_update"
  | "rule_change"
  | "sampling_update"
  | "other";

export interface ChangeRequest {
  id: string;
  title: string;
  description: string;
  changeType: ChangeType;
  payload: Record<string, unknown>;
  status: ChangeRequestStatus;
  submittedBy: string;
  submittedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewComment: string | null;
  appliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateChangeRequestParams {
  title: string;
  description: string;
  changeType?: ChangeType;
  payload?: Record<string, unknown>;
  createdBy: string;
}

export interface ListChangeRequestsFilter {
  status?: ChangeRequestStatus;
  submittedBy?: string;
}

// =============================================================================
// SERVICE
// =============================================================================

export class ChangeApprovalService {
  private static instance: ChangeApprovalService;

  private constructor() {}

  public static getInstance(): ChangeApprovalService {
    if (!ChangeApprovalService.instance) {
      ChangeApprovalService.instance = new ChangeApprovalService();
    }
    return ChangeApprovalService.instance;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * Creates a new change request in draft status.
   */
  public async createDraft(
    params: CreateChangeRequestParams
  ): Promise<ChangeRequest> {
    const db = getDatabase();
    const [row] = await db("change_requests")
      .insert({
        id: crypto.randomUUID(),
        title: params.title,
        description: params.description,
        change_type: params.changeType ?? "config_update",
        payload: JSON.stringify(params.payload ?? {}),
        status: "draft",
        submitted_by: params.createdBy,
        submitted_at: null,
        reviewed_by: null,
        reviewed_at: null,
        review_comment: null,
        applied_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    logger.info(
      {
        feature: "change_approval",
        action: "draft_created",
        actor: params.createdBy,
        resource_id: row.id,
        new_status: "draft",
        timestamp: new Date().toISOString(),
      },
      "Change request draft created"
    );

    return this.mapRow(row);
  }

  /**
   * Returns a single change request by ID, or null when not found.
   */
  public async getById(id: string): Promise<ChangeRequest | null> {
    const db = getDatabase();
    const row = await db("change_requests").where("id", id).first();
    return row ? this.mapRow(row) : null;
  }

  /**
   * Lists change requests with optional filtering.
   */
  public async listRequests(
    filter: ListChangeRequestsFilter = {}
  ): Promise<ChangeRequest[]> {
    const db = getDatabase();
    let query = db("change_requests").orderBy("created_at", "desc");

    if (filter.status) query = query.where("status", filter.status);
    if (filter.submittedBy) query = query.where("submitted_by", filter.submittedBy);

    const rows = await query;
    return rows.map(this.mapRow);
  }

  // ---------------------------------------------------------------------------
  // STATE MACHINE TRANSITIONS
  // ---------------------------------------------------------------------------

  /**
   * Transitions a draft change request to pending_approval.
   *
   * Only the original creator may submit their own draft for approval.
   * @throws Error when the request is not in draft status, or the caller
   *   is not the creator.
   */
  public async submitForApproval(
    id: string,
    submittedBy: string
  ): Promise<ChangeRequest> {
    const request = await this.requireById(id);
    this.requireStatus(request, ["draft"], "submitForApproval");

    if (request.submittedBy !== submittedBy) {
      throw new Error(
        `Only the creator (${request.submittedBy}) may submit this change request for approval.`
      );
    }

    const db = getDatabase();
    const [row] = await db("change_requests")
      .where("id", id)
      .update({
        status: "pending_approval",
        submitted_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");

    this.logTransition(id, "pending_approval", submittedBy);
    return this.mapRow(row);
  }

  /**
   * Approves a pending change request.
   *
   * Enforces the four-eyes principle: the approver must not be the same
   * identity as the submitter.
   * @throws Error (HTTP 403 equivalent) when approver === submitter.
   * @throws Error when the request is not in pending_approval status.
   */
  public async approve(
    id: string,
    reviewedBy: string,
    comment?: string
  ): Promise<ChangeRequest> {
    const request = await this.requireById(id);
    this.requireStatus(request, ["pending_approval"], "approve");

    // Four-eyes enforcement — approver must differ from submitter
    if (request.submittedBy === reviewedBy) {
      throw new Error(
        `Four-eyes principle violation: the approver (${reviewedBy}) must not ` +
          `be the same as the submitter (${request.submittedBy}).`
      );
    }

    const db = getDatabase();
    const [row] = await db("change_requests")
      .where("id", id)
      .update({
        status: "approved",
        reviewed_by: reviewedBy,
        reviewed_at: new Date(),
        review_comment: comment ?? null,
        updated_at: new Date(),
      })
      .returning("*");

    this.logTransition(id, "approved", reviewedBy);
    return this.mapRow(row);
  }

  /**
   * Rejects a pending change request. A non-empty review comment is required.
   * @throws Error when comment is empty or the request is not pending_approval.
   */
  public async reject(
    id: string,
    reviewedBy: string,
    comment: string
  ): Promise<ChangeRequest> {
    const request = await this.requireById(id);
    this.requireStatus(request, ["pending_approval"], "reject");

    if (!comment?.trim()) {
      throw new Error("A review comment is required when rejecting a change request.");
    }

    const db = getDatabase();
    const [row] = await db("change_requests")
      .where("id", id)
      .update({
        status: "rejected",
        reviewed_by: reviewedBy,
        reviewed_at: new Date(),
        review_comment: comment,
        updated_at: new Date(),
      })
      .returning("*");

    this.logTransition(id, "rejected", reviewedBy);
    return this.mapRow(row);
  }

  /**
   * Applies an approved change request. Transitions status to applied.
   *
   * The payload is deserialized and logged. Callers that need to execute the
   * payload against a downstream service should extend this method or call it
   * and then act on the returned request's payload.
   *
   * Wrapped in a database transaction to ensure the status update is atomic.
   * @throws Error when the request is not in approved status.
   */
  public async applyChange(
    id: string,
    appliedBy: string
  ): Promise<ChangeRequest> {
    const request = await this.requireById(id);
    this.requireStatus(request, ["approved"], "applyChange");

    const db = getDatabase();

    const updatedRow = await db.transaction(async (trx) => {
      const [row] = await trx("change_requests")
        .where("id", id)
        .update({
          status: "applied",
          applied_at: new Date(),
          updated_at: new Date(),
        })
        .returning("*");

      return row;
    });

    logger.info(
      {
        feature: "change_approval",
        action: "change_applied",
        actor: appliedBy,
        resource_id: id,
        new_status: "applied",
        change_type: request.changeType,
        timestamp: new Date().toISOString(),
      },
      "Change request applied"
    );

    return this.mapRow(updatedRow);
  }

  /**
   * Cancels a draft or pending change request.
   *
   * Only the original creator may cancel. Admin users that need to force-cancel
   * should call this with the `submittedBy` value matching the request creator,
   * or extend this method to accept an `isAdmin` flag.
   * @throws Error when the request is not in a cancellable status, or the
   *   caller is not the creator.
   */
  public async cancelRequest(
    id: string,
    cancelledBy: string
  ): Promise<ChangeRequest> {
    const request = await this.requireById(id);
    this.requireStatus(request, ["draft", "pending_approval"], "cancel");

    if (request.submittedBy !== cancelledBy) {
      throw new Error(
        `Only the creator (${request.submittedBy}) may cancel this change request.`
      );
    }

    const db = getDatabase();
    const [row] = await db("change_requests")
      .where("id", id)
      .update({
        status: "cancelled",
        updated_at: new Date(),
      })
      .returning("*");

    this.logTransition(id, "cancelled", cancelledBy);
    return this.mapRow(row);
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  /**
   * Fetches a change request by ID or throws if not found.
   */
  private async requireById(id: string): Promise<ChangeRequest> {
    const request = await this.getById(id);
    if (!request) {
      throw new Error(`Change request not found: ${id}`);
    }
    return request;
  }

  /**
   * Throws when the request's current status is not in the allowed list.
   */
  private requireStatus(
    request: ChangeRequest,
    allowed: ChangeRequestStatus[],
    operation: string
  ): void {
    if (!allowed.includes(request.status)) {
      throw new Error(
        `Cannot perform '${operation}' on a change request with status '${request.status}'. ` +
          `Allowed statuses: ${allowed.join(", ")}.`
      );
    }
  }

  /** Emits a structured log entry for every status transition. */
  private logTransition(
    resourceId: string,
    newStatus: ChangeRequestStatus,
    actor: string
  ): void {
    logger.info(
      {
        feature: "change_approval",
        action: "status_transition",
        actor,
        resource_id: resourceId,
        new_status: newStatus,
        timestamp: new Date().toISOString(),
      },
      `Change request transitioned to ${newStatus}`
    );
  }

  // ---------------------------------------------------------------------------
  // MAPPER
  // ---------------------------------------------------------------------------

  private mapRow(row: Record<string, unknown>): ChangeRequest {
    const parsePayload = (v: unknown): Record<string, unknown> => {
      if (!v) return {};
      if (typeof v === "object") return v as Record<string, unknown>;
      try {
        return JSON.parse(v as string);
      } catch {
        return {};
      }
    };

    return {
      id: row.id as string,
      title: row.title as string,
      description: row.description as string,
      changeType: row.change_type as ChangeType,
      payload: parsePayload(row.payload),
      status: row.status as ChangeRequestStatus,
      submittedBy: row.submitted_by as string,
      submittedAt: (row.submitted_at as Date) ?? null,
      reviewedBy: (row.reviewed_by as string) ?? null,
      reviewedAt: (row.reviewed_at as Date) ?? null,
      reviewComment: (row.review_comment as string) ?? null,
      appliedAt: (row.applied_at as Date) ?? null,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

export const changeApprovalService = ChangeApprovalService.getInstance();
