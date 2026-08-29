import { getDatabase } from "../connection.js";

export interface SorobanEventRecord {
  id?: string;
  cursor: string;
  ledger: number;
  ledger_closed_at: Date;
  contract_id: string;
  topic: string;
  value: any;
  created_at?: Date;
}

export class SorobanEventModel {
  private db = getDatabase();
  private table = "soroban_events";

  async insert(events: SorobanEventRecord[]): Promise<void> {
    if (events.length === 0) return;
    await this.db(this.table)
      .insert(events)
      .onConflict("cursor")
      .ignore(); // cursor is unique
  }

  async getLatestCursor(contractId: string): Promise<string | undefined> {
    const record = await this.db(this.table)
      .where("contract_id", contractId)
      .orderBy("ledger_closed_at", "desc")
      .first("cursor");
    return record?.cursor;
  }

  async getPaginatedEvents(
    contractId?: string,
    limit = 100,
    cursor?: string
  ): Promise<{ data: SorobanEventRecord[]; nextCursor?: string }> {
    let query = this.db(this.table).orderBy("ledger_closed_at", "desc").limit(limit);

    if (contractId) {
      query = query.where("contract_id", contractId);
    }

    if (cursor) {
      // Find the event with this cursor to get its ledger_closed_at
      const cursorEvent = await this.db(this.table).where("cursor", cursor).first();
      if (cursorEvent) {
        query = query.where("ledger_closed_at", "<=", cursorEvent.ledger_closed_at).andWhereNot("cursor", cursor);
      }
    }

    const rows = await query;
    const nextCursor = rows.length === limit ? rows[rows.length - 1].cursor : undefined;

    return {
      data: rows as SorobanEventRecord[],
      nextCursor,
    };
  }
}

export const sorobanEventModel = new SorobanEventModel();
