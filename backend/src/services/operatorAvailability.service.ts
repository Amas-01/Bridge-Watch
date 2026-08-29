import { getDatabase } from "../database/connection.js";
import { logger } from "../utils/logger.js";

export type OperatorAvailabilityStatus = "available" | "unavailable" | "on_call";

export interface OperatorAvailabilityEntry {
  id: string;
  operator: string;
  status: OperatorAvailabilityStatus;
  start_time: Date | string;
  end_time: Date | string;
  notes: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateAvailabilityInput {
  operator: string;
  status: OperatorAvailabilityStatus;
  startTime: Date;
  endTime: Date;
  notes?: string | null;
  createdBy: string;
}

export interface UpdateAvailabilityInput {
  status?: OperatorAvailabilityStatus;
  startTime?: Date;
  endTime?: Date;
  notes?: string | null;
}

export interface ListAvailabilityOptions {
  operator?: string;
  from?: Date;
  to?: Date;
  status?: OperatorAvailabilityStatus;
}

/** Pure: whether two time ranges overlap. */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export class OperatorAvailabilityService {
  private readonly db = getDatabase();

  async createAvailability(
    input: CreateAvailabilityInput
  ): Promise<OperatorAvailabilityEntry> {
    if (input.endTime.getTime() <= input.startTime.getTime()) {
      throw new Error("endTime must be after startTime");
    }

    const [record] = await this.db("operator_availability")
      .insert({
        operator: input.operator,
        status: input.status,
        start_time: input.startTime,
        end_time: input.endTime,
        notes: input.notes ?? null,
        created_by: input.createdBy,
      })
      .returning("*");

    logger.info(
      { operator: input.operator, status: input.status },
      "Operator availability entry created"
    );

    return record;
  }

  async updateAvailability(
    id: string,
    updates: UpdateAvailabilityInput
  ): Promise<OperatorAvailabilityEntry | undefined> {
    const existing = await this.getAvailability(id);
    if (!existing) throw new Error("Availability entry not found");

    const startTime = updates.startTime ?? new Date(existing.start_time);
    const endTime = updates.endTime ?? new Date(existing.end_time);
    if (endTime.getTime() <= startTime.getTime()) {
      throw new Error("endTime must be after startTime");
    }

    const updatePayload: Record<string, unknown> = { updated_at: new Date() };
    if (updates.status) updatePayload.status = updates.status;
    if (updates.startTime) updatePayload.start_time = updates.startTime;
    if (updates.endTime) updatePayload.end_time = updates.endTime;
    if (updates.notes !== undefined) updatePayload.notes = updates.notes;

    await this.db("operator_availability").where({ id }).update(updatePayload);
    return this.getAvailability(id);
  }

  async deleteAvailability(id: string): Promise<void> {
    await this.db("operator_availability").where({ id }).delete();
    logger.info({ id }, "Operator availability entry deleted");
  }

  async getAvailability(id: string): Promise<OperatorAvailabilityEntry | undefined> {
    return this.db("operator_availability").where({ id }).first();
  }

  async listAvailability(
    options?: ListAvailabilityOptions
  ): Promise<OperatorAvailabilityEntry[]> {
    const query = this.db("operator_availability").orderBy("start_time", "asc");

    if (options?.operator) {
      query.where({ operator: options.operator });
    }
    if (options?.status) {
      query.where({ status: options.status });
    }
    if (options?.from) {
      query.where("end_time", ">=", options.from);
    }
    if (options?.to) {
      query.where("start_time", "<=", options.to);
    }

    return query;
  }

  /**
   * Returns the operator calendar for a given time range, grouped by operator,
   * suitable for rendering as a calendar/timeline view.
   */
  async getCalendar(
    rangeStart: Date,
    rangeEnd: Date
  ): Promise<Record<string, OperatorAvailabilityEntry[]>> {
    const entries = await this.listAvailability({ from: rangeStart, to: rangeEnd });

    const calendar: Record<string, OperatorAvailabilityEntry[]> = {};
    for (const entry of entries) {
      if (!calendar[entry.operator]) calendar[entry.operator] = [];
      calendar[entry.operator].push(entry);
    }
    return calendar;
  }
}

export const operatorAvailabilityService = new OperatorAvailabilityService();
