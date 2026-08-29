import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";
import type {
  OperatorHandoffRecord,
  HandoffChecklistItem,
  HandoffStatus,
} from "../database/types.js";

export interface CreateHandoffInput {
  shiftName: string;
  outgoingOperator: string;
  incomingOperator: string;
  checklistItems?: HandoffChecklistItem[];
  summaryNotes?: string;
  incidentsReviewed?: string[];
}

export interface UpdateHandoffInput {
  shiftName?: string;
  incomingOperator?: string;
  checklistItems?: HandoffChecklistItem[];
  summaryNotes?: string;
  incidentsReviewed?: string[];
}

export class OperatorHandoffService {
  private readonly db = getDatabase();

  async createHandoff(input: CreateHandoffInput): Promise<OperatorHandoffRecord> {
    const defaultChecklist: HandoffChecklistItem[] = input.checklistItems ?? [
      { id: "ch-1", label: "Review active bridge alerts and incidents", category: "incidents", completed: false },
      { id: "ch-2", label: "Verify circuit breaker states across monitored bridges", category: "circuit_breakers", completed: false },
      { id: "ch-3", label: "Check scheduled maintenance windows for current shift", category: "maintenance", completed: false },
      { id: "ch-4", label: "Confirm oracle price feeds and telemetry data freshness", category: "health_checks", completed: false },
    ];

    const [record] = await this.db("operator_handoffs")
      .insert({
        shift_name: input.shiftName,
        outgoing_operator: input.outgoingOperator,
        incoming_operator: input.incomingOperator,
        status: "draft",
        checklist_items: JSON.stringify(defaultChecklist),
        summary_notes: input.summaryNotes ?? null,
        incidents_reviewed: JSON.stringify(input.incidentsReviewed ?? []),
      })
      .returning("*");

    logger.info(
      { handoffId: record.id, outgoing: input.outgoingOperator, incoming: input.incomingOperator },
      "Operator handoff checklist created"
    );

    return this.parseRecord(record);
  }

  async updateHandoff(
    id: string,
    operator: string,
    updates: UpdateHandoffInput
  ): Promise<OperatorHandoffRecord | undefined> {
    const existing = await this.getHandoff(id);
    if (!existing) throw new Error("Handoff checklist not found");
    if (existing.status !== "draft") throw new Error("Only draft handoffs can be updated");
    if (existing.outgoing_operator !== operator) throw new Error("Unauthorized to update handoff");

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date(),
    };

    if (updates.shiftName) updatePayload.shift_name = updates.shiftName;
    if (updates.incomingOperator) updatePayload.incoming_operator = updates.incomingOperator;
    if (updates.summaryNotes !== undefined) updatePayload.summary_notes = updates.summaryNotes;
    if (updates.checklistItems) updatePayload.checklist_items = JSON.stringify(updates.checklistItems);
    if (updates.incidentsReviewed) updatePayload.incidents_reviewed = JSON.stringify(updates.incidentsReviewed);

    await this.db("operator_handoffs").where({ id }).update(updatePayload);
    return this.getHandoff(id);
  }

  async submitHandoff(
    id: string,
    operator: string,
    signature: string
  ): Promise<OperatorHandoffRecord> {
    const existing = await this.getHandoff(id);
    if (!existing) throw new Error("Handoff checklist not found");
    if (existing.outgoing_operator !== operator) throw new Error("Only outgoing operator can submit handoff");
    if (existing.status !== "draft") throw new Error("Handoff is not in draft status");

    const items = typeof existing.checklist_items === "string"
      ? JSON.parse(existing.checklist_items)
      : existing.checklist_items;

    const uncompleted = items.filter((item: HandoffChecklistItem) => !item.completed);
    if (uncompleted.length > 0) {
      throw new Error(`Cannot submit handoff: ${uncompleted.length} checklist items are incomplete`);
    }

    const now = new Date();
    await this.db("operator_handoffs")
      .where({ id })
      .update({
        status: "submitted",
        signoff_outgoing_signature: signature,
        submitted_at: now,
        updated_at: now,
      });

    logger.info({ handoffId: id, operator }, "Operator handoff submitted for acknowledgment");
    const updated = await this.getHandoff(id);
    return updated!;
  }

  async acknowledgeHandoff(
    id: string,
    operator: string,
    signature: string
  ): Promise<OperatorHandoffRecord> {
    const existing = await this.getHandoff(id);
    if (!existing) throw new Error("Handoff checklist not found");
    if (existing.incoming_operator !== operator) throw new Error("Only assigned incoming operator can acknowledge handoff");
    if (existing.status !== "submitted") throw new Error("Handoff is not in submitted status");

    const now = new Date();
    await this.db("operator_handoffs")
      .where({ id })
      .update({
        status: "acknowledged",
        signoff_incoming_signature: signature,
        acknowledged_at: now,
        updated_at: now,
      });

    logger.info({ handoffId: id, operator }, "Operator handoff acknowledged by incoming operator");
    const updated = await this.getHandoff(id);
    return updated!;
  }

  async getHandoff(id: string): Promise<OperatorHandoffRecord | undefined> {
    const record = await this.db("operator_handoffs").where({ id }).first();
    return record ? this.parseRecord(record) : undefined;
  }

  async listHandoffs(options?: {
    status?: HandoffStatus;
    operator?: string;
    limit?: number;
  }): Promise<OperatorHandoffRecord[]> {
    const query = this.db("operator_handoffs")
      .orderBy("created_at", "desc")
      .limit(options?.limit ?? 50);

    if (options?.status) {
      query.where({ status: options.status });
    }

    if (options?.operator) {
      query.where((builder) => {
        builder.where({ outgoing_operator: options.operator })
          .orWhere({ incoming_operator: options.operator });
      });
    }

    const records = await query;
    return records.map((r) => this.parseRecord(r));
  }

  private parseRecord(record: any): OperatorHandoffRecord {
    return {
      ...record,
      checklist_items: typeof record.checklist_items === "string"
        ? JSON.parse(record.checklist_items)
        : record.checklist_items,
      incidents_reviewed: typeof record.incidents_reviewed === "string"
        ? JSON.parse(record.incidents_reviewed)
        : record.incidents_reviewed,
    };
  }
}
