import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import { randomBytes } from "crypto";

export interface IncidentOwnershipTransfer {
  id: string;
  incident_id: string;
  from_operator: string | null;
  to_operator: string;
  initiated_by: string;
  reason: string | null;
  transferred_at: Date;
}

export interface TransferOwnershipInput {
  incidentId: string;
  toOperator: string;
  initiatedBy: string;
  reason?: string | null;
}

export class IncidentOwnershipTransferService {
  private readonly db = getDatabase();

  /**
   * Transfer ownership (assignment) of an incident to a different operator,
   * recording an audit trail entry for the transfer.
   */
  async transferOwnership(
    input: TransferOwnershipInput
  ): Promise<{ transfer: IncidentOwnershipTransfer; incident: Record<string, unknown> }> {
    const incident = await this.db("incidents").where({ id: input.incidentId }).first();
    if (!incident) {
      throw new Error("Incident not found");
    }

    const fromOperator = incident.assigned_to ?? null;
    if (fromOperator === input.toOperator) {
      throw new Error("Incident is already owned by the target operator");
    }

    const now = new Date();
    const transferId = randomBytes(16).toString("hex");

    await this.db("incidents")
      .where({ id: input.incidentId })
      .update({ assigned_to: input.toOperator, updated_at: now });

    const transferRecord = {
      id: transferId,
      incident_id: input.incidentId,
      from_operator: fromOperator,
      to_operator: input.toOperator,
      initiated_by: input.initiatedBy,
      reason: input.reason ?? null,
      transferred_at: now,
    };

    await this.db("incident_ownership_transfers").insert(transferRecord);

    logger.info(
      {
        incidentId: input.incidentId,
        fromOperator,
        toOperator: input.toOperator,
        initiatedBy: input.initiatedBy,
      },
      "Incident ownership transferred"
    );

    const updatedIncident = await this.db("incidents").where({ id: input.incidentId }).first();

    return { transfer: transferRecord, incident: updatedIncident };
  }

  async getTransferHistory(incidentId: string): Promise<IncidentOwnershipTransfer[]> {
    return this.db("incident_ownership_transfers")
      .where({ incident_id: incidentId })
      .orderBy("transferred_at", "desc");
  }

  async listTransfers(options?: {
    operator?: string;
    limit?: number;
  }): Promise<IncidentOwnershipTransfer[]> {
    const query = this.db("incident_ownership_transfers")
      .orderBy("transferred_at", "desc")
      .limit(options?.limit ?? 50);

    if (options?.operator) {
      query.where((builder: any) => {
        builder.where({ to_operator: options.operator }).orWhere({ from_operator: options.operator });
      });
    }

    return query;
  }
}

export const incidentOwnershipTransferService = new IncidentOwnershipTransferService();
