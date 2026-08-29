import { getDatabase } from "../connection.js";

export interface BackfillJobRecord {
  id?: string;
  source_id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "STOPPED";
  range_start: number;
  range_end: number;
  chunk_size: number;
  completed_chunks: string; // JSON
  failed_chunks: string; // JSON
  started_at?: Date;
  completed_at?: Date;
  created_at?: Date;
  updated_at?: Date;
}

export class BackfillJobModel {
  private db = getDatabase();
  private table = "backfill_jobs";

  async create(job: Partial<BackfillJobRecord>): Promise<BackfillJobRecord> {
    const [inserted] = await this.db(this.table).insert(job).returning("*");
    return inserted as BackfillJobRecord;
  }

  async updateStatus(id: string, status: BackfillJobRecord["status"], details?: Partial<BackfillJobRecord>): Promise<void> {
    const updateData: any = { status, updated_at: new Date(), ...details };
    if (status === "RUNNING") updateData.started_at = new Date();
    if (status === "COMPLETED" || status === "FAILED" || status === "STOPPED") updateData.completed_at = new Date();

    await this.db(this.table).where("id", id).update(updateData);
  }

  async getLatestForSource(sourceId: string): Promise<BackfillJobRecord | undefined> {
    const record = await this.db(this.table)
      .where("source_id", sourceId)
      .orderBy("created_at", "desc")
      .first();
    return record as BackfillJobRecord | undefined;
  }
}

export const backfillJobModel = new BackfillJobModel();
