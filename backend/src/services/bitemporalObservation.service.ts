import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";
export interface BitemporalObservation { kind: string; subject: string; validFrom: Date; validTo?: Date; payload: unknown }
/** UTC instants plus tstzrange constraints make valid/transaction clocks explicit. */
export class BitemporalObservationService {
  constructor(private readonly db: Knex = getDatabase()) {}
  async correct(observation: BitemporalObservation): Promise<string> { return this.db.transaction(async (tx) => { const current = await tx("bitemporal_observations").where({ kind: observation.kind, subject: observation.subject }).whereNull("transaction_to").whereRaw("tstzrange(valid_from, COALESCE(valid_to, 'infinity'::timestamptz), '[)') && tstzrange(?, COALESCE(?, 'infinity'::timestamptz), '[)')", [observation.validFrom, observation.validTo ?? null]).forUpdate(); const now = new Date(); if (current.length) await tx("bitemporal_observations").whereIn("id", current.map((x) => x.id)).update({ transaction_to: now }); const [row] = await tx("bitemporal_observations").insert({ kind: observation.kind, subject: observation.subject, valid_from: observation.validFrom, valid_to: observation.validTo ?? null, transaction_from: now, payload: JSON.stringify(observation.payload), supersedes_id: current[0]?.id ?? null }).returning("id"); return String(row.id); }); }
  async asKnownAt(kind: string, subject: string, systemTime: Date, validTime: Date) { return this.db("bitemporal_observations").where({ kind, subject }).where("transaction_from", "<=", systemTime).where((q) => q.whereNull("transaction_to").orWhere("transaction_to", ">", systemTime)).where("valid_from", "<=", validTime).where((q) => q.whereNull("valid_to").orWhere("valid_to", ">", validTime)).orderBy("transaction_from", "desc").first(); }
}
export const bitemporalObservationService = new BitemporalObservationService();
