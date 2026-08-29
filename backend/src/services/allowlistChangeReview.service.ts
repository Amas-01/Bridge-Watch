import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { auditService } from "./audit.service.js";

// =============================================================================
// TYPES
// =============================================================================

export interface AllowlistChangeRequest {
  id: string;
  contractAddress: string;
  action: "add" | "remove";
  reason: string;
  requestedBy: string;
  status: "pending" | "approved" | "rejected";
  reviewedBy: string | null;
  reviewComment: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractAllowlistEntry {
  id: string;
  contractAddress: string;
  addedBy: string;
  addedAt: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmitChangeRequestParams {
  contractAddress: string;
  action: "add" | "remove";
  reason: string;
}

// =============================================================================
// ALLOWLIST CHANGE REVIEW SERVICE
// =============================================================================

export class AllowlistChangeReviewService {
  private static instance: AllowlistChangeReviewService;

  private constructor() {}

  public static getInstance(): AllowlistChangeReviewService {
    if (!AllowlistChangeReviewService.instance) {
      AllowlistChangeReviewService.instance = new AllowlistChangeReviewService();
    }
    return AllowlistChangeReviewService.instance;
  }

  /**
   * Submit a new change request
   */
  async submitChangeRequest(
    params: SubmitChangeRequestParams,
    requestedBy: string
  ): Promise<AllowlistChangeRequest> {
    logger.info({ params, requestedBy }, "Submitting allowlist change request");

    // Validate Ethereum address format
    if (!this.isValidEthereumAddress(params.contractAddress)) {
      throw new Error("Invalid Ethereum address format");
    }

    const db = getDatabase();

    const [inserted] = await db("allowlist_change_requests")
      .insert({
        contract_address: params.contractAddress.toLowerCase(),
        action: params.action,
        reason: params.reason,
        requested_by: requestedBy,
        status: "pending",
      })
      .returning("*");

    await auditService.log({
      action: "admin.provider_allowlist_changed",
      actorId: requestedBy,
      actorType: "admin",
      resourceType: "allowlist_change_request",
      resourceId: inserted.id,
      after: { contractAddress: params.contractAddress, action: params.action },
      metadata: { reason: params.reason },
      severity: "warning",
    });

    logger.info({ requestId: inserted.id, requestedBy }, "Change request submitted");

    return this.mapChangeRequestRow(inserted);
  }

  /**
   * Review a change request (approve or reject) with four-eyes enforcement
   */
  async reviewRequest(
    id: string,
    decision: "approved" | "rejected",
    reviewedBy: string,
    comment?: string
  ): Promise<AllowlistChangeRequest> {
    logger.info({ id, decision, reviewedBy }, "Reviewing allowlist change request");

    const db = getDatabase();

    // Fetch the request
    const request = await db("allowlist_change_requests").where({ id }).first();

    if (!request) {
      throw new Error("Change request not found");
    }

    if (request.status !== "pending") {
      throw new Error(`Cannot review request with status: ${request.status}`);
    }

    // Four-eyes check: reviewer must be different from requester
    if (request.requested_by === reviewedBy) {
      throw new Error("Reviewer cannot be the same as the requester (four-eyes principle)");
    }

    const now = new Date();

    // Update the request
    const [updated] = await db("allowlist_change_requests")
      .where({ id })
      .update({
        status: decision,
        reviewed_by: reviewedBy,
        review_comment: comment || null,
        reviewed_at: now,
        updated_at: now,
      })
      .returning("*");

    await auditService.log({
      action: "admin.provider_allowlist_changed",
      actorId: reviewedBy,
      actorType: "admin",
      resourceType: "allowlist_change_request",
      resourceId: id,
      before: { status: "pending" },
      after: { status: decision },
      metadata: { comment, requestedBy: request.requested_by },
      severity: decision === "approved" ? "warning" : "info",
    });

    logger.info({ id, decision, reviewedBy }, "Change request reviewed");

    return this.mapChangeRequestRow(updated);
  }

  /**
   * Apply an approved change to the allowlist
   */
  async applyApprovedChange(id: string, appliedBy: string): Promise<void> {
    logger.info({ id, appliedBy }, "Applying approved allowlist change");

    const db = getDatabase();

    await db.transaction(async (trx) => {
      // Fetch the request
      const request = await trx("allowlist_change_requests").where({ id }).first();

      if (!request) {
        throw new Error("Change request not found");
      }

      if (request.status !== "approved") {
        throw new Error("Only approved requests can be applied");
      }

      const contractAddress = request.contract_address;

      if (request.action === "add") {
        // Check if already exists
        const existing = await trx("contract_allowlist")
          .where({ contract_address: contractAddress })
          .first();

        if (existing && existing.is_active) {
          throw new Error("Contract address already in allowlist");
        }

        if (existing) {
          // Reactivate
          await trx("contract_allowlist")
            .where({ id: existing.id })
            .update({ is_active: true, updated_at: new Date() });
        } else {
          // Insert new
          await trx("contract_allowlist").insert({
            contract_address: contractAddress,
            added_by: appliedBy,
            added_at: new Date(),
            is_active: true,
          });
        }

        logger.info({ contractAddress, appliedBy }, "Contract added to allowlist");
      } else if (request.action === "remove") {
        // Deactivate
        const existing = await trx("contract_allowlist")
          .where({ contract_address: contractAddress })
          .first();

        if (!existing) {
          throw new Error("Contract address not found in allowlist");
        }

        await trx("contract_allowlist")
          .where({ id: existing.id })
          .update({ is_active: false, updated_at: new Date() });

        logger.info({ contractAddress, appliedBy }, "Contract removed from allowlist");
      }

      await auditService.log({
        action: "admin.provider_allowlist_changed",
        actorId: appliedBy,
        actorType: "admin",
        resourceType: "contract_allowlist",
        resourceId: contractAddress,
        metadata: { action: request.action, requestId: id },
        severity: "critical",
      });
    });

    logger.info({ id, appliedBy }, "Allowlist change applied successfully");
  }

  /**
   * Get current allowlist (active entries only)
   */
  async getCurrentAllowlist(): Promise<ContractAllowlistEntry[]> {
    logger.info({}, "Fetching current allowlist");

    const db = getDatabase();
    const rows = await db("contract_allowlist")
      .where({ is_active: true })
      .orderBy("added_at", "desc");

    return rows.map(this.mapAllowlistRow);
  }

  /**
   * List change requests by status
   */
  async listChangeRequests(
    status?: "pending" | "approved" | "rejected"
  ): Promise<AllowlistChangeRequest[]> {
    logger.info({ status }, "Listing allowlist change requests");

    const db = getDatabase();
    let query = db("allowlist_change_requests").orderBy("created_at", "desc");

    if (status) {
      query = query.where({ status });
    }

    const rows = await query;
    return rows.map(this.mapChangeRequestRow);
  }

  /**
   * Validate Ethereum address format (basic check)
   */
  private isValidEthereumAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Map database row to AllowlistChangeRequest type
   */
  private mapChangeRequestRow(row: Record<string, unknown>): AllowlistChangeRequest {
    return {
      id: row.id as string,
      contractAddress: row.contract_address as string,
      action: row.action as "add" | "remove",
      reason: row.reason as string,
      requestedBy: row.requested_by as string,
      status: row.status as "pending" | "approved" | "rejected",
      reviewedBy: (row.reviewed_by as string) || null,
      reviewComment: (row.review_comment as string) || null,
      reviewedAt: (row.reviewed_at as Date) || null,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  /**
   * Map database row to ContractAllowlistEntry type
   */
  private mapAllowlistRow(row: Record<string, unknown>): ContractAllowlistEntry {
    return {
      id: row.id as string,
      contractAddress: row.contract_address as string,
      addedBy: row.added_by as string,
      addedAt: row.added_at as Date,
      isActive: row.is_active as boolean,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }
}

export const allowlistChangeReviewService = AllowlistChangeReviewService.getInstance();
