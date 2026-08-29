import crypto from "node:crypto";
import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";

export interface CanonicalEventInput { chain: string; contract: string; transactionHash: string; eventIndex: number; eventType: string; decoderVersion: string; provider: string; providerEventId: string; rawPayload: unknown; decodedPayload: unknown; validAt: Date }
export interface CanonicalEventResult { id: string; identity: string; status: "accepted" | "quarantined"; duplicate: boolean }
function stable(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`; return JSON.stringify(value); }
const digest = (value: unknown) => crypto.createHash("sha256").update(stable(value)).digest("hex");
/** Canonical identity intentionally excludes decoderVersion, preserving it over decoder upgrades. */
export function canonicalEventIdentity(input: Pick<CanonicalEventInput, "chain" | "contract" | "transactionHash" | "eventIndex" | "eventType">): string { return digest({ chain: input.chain.toLowerCase(), contract: input.contract.toLowerCase(), transactionHash: input.transactionHash.toLowerCase(), eventIndex: input.eventIndex, eventType: input.eventType }); }

export class CanonicalEventIdentityService {
  constructor(private readonly db: Knex = getDatabase()) {}
  async ingest(input: CanonicalEventInput): Promise<CanonicalEventResult> {
    const identity = canonicalEventIdentity(input); const payloadHash = digest(input.rawPayload);
    return this.db.transaction(async (tx) => {
      const alias = await tx("canonical_event_aliases").where({ provider: input.provider, provider_event_id: input.providerEventId }).first();
      if (alias) { const event = await tx("canonical_chain_events").where({ id: alias.canonical_event_id }).first(); if (event?.identity !== identity) return this.quarantine(tx, identity, event?.id, "provider alias resolves to a different canonical identity", input); }
      let event = await tx("canonical_chain_events").where({ identity }).forUpdate().first();
      if (!event) { const [created] = await tx("canonical_chain_events").insert({ identity, chain: input.chain.toLowerCase(), contract: input.contract.toLowerCase(), transaction_hash: input.transactionHash.toLowerCase(), event_index: input.eventIndex, event_type: input.eventType, decoder_version: input.decoderVersion, raw_payload_hash: payloadHash, decoded_payload: JSON.stringify(input.decodedPayload), valid_at: input.validAt, status: "accepted" }).returning("*"); event = created; }
      // Provider payload envelopes legitimately differ (Horizon versus an EVM
      // RPC, for example); retain every immutable payload under one identity.
      // A collision is only quarantined when an alias asserts two identities.
      await tx("canonical_event_raw_payloads").insert({ canonical_event_id: event.id, provider: input.provider, payload_hash: payloadHash, payload: JSON.stringify(input.rawPayload) }).onConflict(["canonical_event_id", "provider", "payload_hash"]).ignore();
      await tx("canonical_event_aliases").insert({ provider: input.provider, provider_event_id: input.providerEventId, canonical_event_id: event.id }).onConflict(["provider", "provider_event_id"]).ignore();
      return { id: String(event.id), identity, status: event.status as "accepted", duplicate: Boolean(alias || event.decoder_version !== input.decoderVersion) };
    });
  }
  private async quarantine(tx: Knex.Transaction, identity: string, eventId: string | undefined, reason: string, input: CanonicalEventInput): Promise<CanonicalEventResult> { await tx("canonical_event_collisions").insert({ identity, canonical_event_id: eventId ?? null, reason, incoming: JSON.stringify(input) }); if (eventId) await tx("canonical_chain_events").where({ id: eventId }).update({ status: "quarantined" }); return { id: eventId ?? "", identity, status: "quarantined", duplicate: false }; }
}
export const canonicalEventIdentityService = new CanonicalEventIdentityService();
