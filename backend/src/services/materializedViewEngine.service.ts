import crypto from "node:crypto";
import type { Knex } from "knex";
import { getDatabase } from "../database/connection.js";
import { OutboxProducer } from "../outbox/eventProducer.js";

export type Reducer<State> = (state: State, event: Record<string, unknown>) => State;
export interface ReplayRequest<State> { viewName: string; scope: string; codeVersion: string; config: unknown; inputWatermarks: Record<string, number>; initialState: State; reduce: Reducer<State>; asset?: string; from?: Date; to?: Date }
const stable = (value: any): string => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value && typeof value === "object" ? `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(",")}}` : JSON.stringify(value);
const hash = (v: unknown) => crypto.createHash("sha256").update(stable(v)).digest("hex");

/** Deterministic replayer: canonical input ordering + durable checkpoint and output hashes. */
export class MaterializedViewEngine {
  constructor(private readonly db: Knex = getDatabase(), private readonly outbox = new OutboxProducer(db)) {}
  async replay<State>(request: ReplayRequest<State>): Promise<{ versionId: string; output: State; outputHash: string }> {
    const eventsQ = this.db("canonical_chain_events").where("status", "accepted").orderBy("identity", "asc");
    if (request.asset) eventsQ.whereRaw("decoded_payload ->> 'asset' = ?", [request.asset]);
    if (request.from) eventsQ.where("valid_at", ">=", request.from); if (request.to) eventsQ.where("valid_at", "<", request.to);
    const events = await eventsQ;
    const configHash = hash(request.config); const inputHash = hash(events.map((e) => ({ identity: e.identity, raw: e.raw_payload_hash })));
    const versionId = await this.db.transaction(async (tx) => {
      let version = await tx("materialized_view_versions").where({ view_name: request.viewName, scope: request.scope, input_hash: inputHash, code_version: request.codeVersion, config_hash: configHash }).forUpdate().first();
      if (!version) { const [created] = await tx("materialized_view_versions").insert({ view_name: request.viewName, scope: request.scope, code_version: request.codeVersion, config_hash: configHash, input_watermarks: JSON.stringify(request.inputWatermarks), input_hash: inputHash, status: "running" }).returning("*"); version = created; await tx("materialized_view_checkpoints").insert({ view_version_id: version.id, state: JSON.stringify(request.initialState) }); }
      return String(version.id);
    });
    // Each checkpoint is committed independently. A retry resumes from the
    // durable count/state instead of reapplying an already reduced event.
    for (;;) {
      const next = await this.db.transaction(async (tx) => {
        const checkpoint = await tx("materialized_view_checkpoints").where({ view_version_id: versionId }).forUpdate().first();
        const index = Number(checkpoint.processed_count);
        if (index >= events.length) return null;
        const state = request.reduce((typeof checkpoint.state === "string" ? JSON.parse(checkpoint.state) : checkpoint.state) as State, events[index]);
        await tx("materialized_view_checkpoints").where({ view_version_id: versionId }).update({ last_event_identity: events[index].identity, processed_count: index + 1, state: JSON.stringify(state), updated_at: new Date() });
        return state;
      });
      if (next === null) break;
    }
    return this.db.transaction(async (tx) => {
      const checkpoint = await tx("materialized_view_checkpoints").where({ view_version_id: versionId }).forUpdate().first();
      const output = (typeof checkpoint.state === "string" ? JSON.parse(checkpoint.state) : checkpoint.state) as State;
      const outputHash = hash(output);
      await tx("materialized_view_versions").where({ id: versionId }).update({ output: JSON.stringify(output), output_hash: outputHash, status: "completed", completed_at: new Date() });
      return { versionId, output, outputHash };
    });
  }
  async promote(viewName: string, scope: string, versionId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const version = await tx("materialized_view_versions").where({ id: versionId, view_name: viewName, scope, status: "completed" }).first();
      if (!version) throw new Error("only completed view versions may be promoted");
      await tx("materialized_view_promotions").insert({ view_name: viewName, scope, view_version_id: versionId }).onConflict(["view_name", "scope"]).merge({ view_version_id: versionId, promoted_at: new Date() });
      // One transactional outbox record is the atomic fan-out boundary for API cache and WebSocket consumers.
      await this.outbox.publishTransactional(tx, { aggregateType: "materialized_view", aggregateId: `${viewName}:${scope}`, eventType: "transaction.update", payload: { type: "materialized_view.promoted", versionId, outputHash: version.output_hash } });
    });
  }
  async verify<State>(live: State, replayed: State): Promise<{ equal: boolean; liveHash: string; replayHash: string }> { const liveHash = hash(live), replayHash = hash(replayed); return { equal: liveHash === replayHash, liveHash, replayHash }; }
}
export const materializedViewEngine = new MaterializedViewEngine();
