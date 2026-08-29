import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type CorrectionStatus = "pending" | "approved" | "rejected";

export interface DataCorrection {
  id: string;
  requesterAddress: string;
  approverAddress: string | null;
  dataType: string;
  entityId: string;
  originalData: Record<string, unknown>;
  correctedData: Record<string, unknown>;
  reason: string;
  status: CorrectionStatus;
  rejectionReason: string | null;
  requestedAt: Date;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DataCorrectionService {
  async createCorrection(
    requesterAddress: string,
    dataType: string,
    entityId: string,
    originalData: Record<string, unknown>,
    correctedData: Record<string, unknown>,
    reason: string
  ): Promise<DataCorrection> {
    const db = getDatabase();
    const [correction] = await db("data_corrections")
      .insert({
        requester_address: requesterAddress,
        data_type: dataType,
        entity_id: entityId,
        original_data: originalData,
        corrected_data: correctedData,
        reason,
      })
      .returning("*");
    return this.formatCorrection(correction);
  }

  async getPendingCorrections(): Promise<DataCorrection[]> {
    const db = getDatabase();
    const corrections = await db("data_corrections")
      .where("status", "pending")
      .orderBy("requested_at", "desc");
    return corrections.map((c) => this.formatCorrection(c));
  }

  async getCorrectionsForRequester(requesterAddress: string): Promise<DataCorrection[]> {
    const db = getDatabase();
    const corrections = await db("data_corrections")
      .where("requester_address", requesterAddress)
      .orderBy("requested_at", "desc");
    return corrections.map((c) => this.formatCorrection(c));
  }

  async approveCorrection(correctionId: string, approverAddress: string): Promise<DataCorrection> {
    const db = getDatabase();
    const [correction] = await db("data_corrections")
      .where("id", correctionId)
      .update({
        status: "approved",
        approver_address: approverAddress,
        decided_at: new Date(),
      })
      .returning("*");
    return this.formatCorrection(correction);
  }

  async rejectCorrection(correctionId: string, rejectionReason: string): Promise<DataCorrection> {
    const db = getDatabase();
    const [correction] = await db("data_corrections")
      .where("id", correctionId)
      .update({
        status: "rejected",
        rejection_reason: rejectionReason,
        decided_at: new Date(),
      })
      .returning("*");
    return this.formatCorrection(correction);
  }

  private formatCorrection(row: any): DataCorrection {
    return {
      id: row.id,
      requesterAddress: row.requester_address,
      approverAddress: row.approver_address,
      dataType: row.data_type,
      entityId: row.entity_id,
      originalData: row.original_data,
      correctedData: row.corrected_data,
      reason: row.reason,
      status: row.status,
      rejectionReason: row.rejection_reason,
      requestedAt: row.requested_at,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
