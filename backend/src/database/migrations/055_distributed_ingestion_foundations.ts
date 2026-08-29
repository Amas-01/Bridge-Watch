import type { Knex } from "knex";

/**
 * Durable coordination and lineage primitives.  The tables deliberately use
 * PostgreSQL constraints as the authority so that restarting/replacing a
 * worker cannot change correctness.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw("CREATE EXTENSION IF NOT EXISTS btree_gist");

  await knex.schema.createTable("ingestion_source_watermarks", (t) => {
    t.string("source", 128).primary();
    t.bigInteger("covered_through").notNullable().defaultTo(0);
    t.bigInteger("finalized_through").notNullable().defaultTo(0);
    t.jsonb("gaps").notNullable().defaultTo("[]");
    t.bigInteger("version").notNullable().defaultTo(0);
    t.timestamp("observed_at", { useTz: true }).notNullable();
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.check("finalized_through <= covered_through", [], "chk_watermark_finality");
  });
  await knex.schema.createTable("ingestion_dependency_barriers", (t) => {
    t.string("consumer", 128).notNullable();
    t.string("source", 128).notNullable();
    t.bigInteger("minimum_finality").notNullable().defaultTo(0);
    t.boolean("required").notNullable().defaultTo(true);
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(["consumer", "source"]);
  });
  await knex.schema.createTable("ingestion_barrier_overrides", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("consumer", 128).notNullable();
    t.string("source", 128).notNullable();
    t.bigInteger("allow_through").notNullable();
    t.string("reason", 500).notNullable();
    t.string("actor_id", 128).notNullable();
    t.timestamp("expires_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["consumer", "source", "expires_at"], "idx_barrier_override_active");
  });

  await knex.schema.createTable("canonical_chain_events", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("identity", 64).notNullable().unique();
    t.string("chain", 64).notNullable();
    t.string("contract", 256).notNullable();
    t.string("transaction_hash", 256).notNullable();
    t.bigInteger("event_index").notNullable();
    t.string("event_type", 128).notNullable();
    t.string("decoder_version", 64).notNullable();
    t.string("raw_payload_hash", 64).notNullable();
    t.jsonb("decoded_payload").notNullable();
    t.string("status", 20).notNullable().defaultTo("accepted");
    t.timestamp("valid_at", { useTz: true }).notNullable();
    t.timestamp("recorded_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["chain", "contract", "transaction_hash", "event_index", "event_type"], { indexName: "uq_canonical_event_components" });
    t.index(["chain", "transaction_hash"], "idx_canonical_event_tx");
  });
  await knex.schema.createTable("canonical_event_aliases", (t) => {
    t.string("provider", 128).notNullable();
    t.string("provider_event_id", 512).notNullable();
    t.uuid("canonical_event_id").notNullable().references("id").inTable("canonical_chain_events");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(["provider", "provider_event_id"]);
  });
  await knex.schema.createTable("canonical_event_raw_payloads", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.uuid("canonical_event_id").notNullable().references("id").inTable("canonical_chain_events");
    t.string("provider", 128).notNullable();
    t.string("payload_hash", 64).notNullable();
    t.jsonb("payload").notNullable();
    t.timestamp("received_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(["canonical_event_id", "provider", "payload_hash"], { indexName: "uq_raw_payload_retention" });
  });
  await knex.schema.createTable("canonical_event_collisions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("identity", 64).notNullable();
    t.uuid("canonical_event_id").nullable();
    t.string("reason", 500).notNullable();
    t.jsonb("incoming").notNullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["identity", "created_at"], "idx_canonical_collision_identity");
  });

  await knex.schema.createTable("bitemporal_observations", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("kind", 64).notNullable(); // price, reserve, bridge_event, health_score, alert
    t.string("subject", 256).notNullable();
    t.timestamp("valid_from", { useTz: true }).notNullable();
    t.timestamp("valid_to", { useTz: true }).nullable();
    t.timestamp("transaction_from", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("transaction_to", { useTz: true }).nullable();
    t.jsonb("payload").notNullable();
    t.uuid("supersedes_id").nullable().references("id").inTable("bitemporal_observations");
    t.check("valid_to IS NULL OR valid_to > valid_from", [], "chk_bitemporal_valid_interval");
    t.check("transaction_to IS NULL OR transaction_to > transaction_from", [], "chk_bitemporal_transaction_interval");
    t.index(["kind", "subject", "transaction_from"], "idx_bitemporal_as_known");
  });
  await knex.raw(`ALTER TABLE bitemporal_observations ADD CONSTRAINT ex_bitemporal_current_valid_overlap
    EXCLUDE USING gist (kind WITH =, subject WITH =, tstzrange(valid_from, COALESCE(valid_to, 'infinity'::timestamptz), '[)') WITH &&)
    WHERE (transaction_to IS NULL)`);

  await knex.schema.createTable("materialized_view_versions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("view_name", 128).notNullable();
    t.string("scope", 256).notNullable();
    t.string("code_version", 128).notNullable();
    t.string("config_hash", 64).notNullable();
    t.jsonb("input_watermarks").notNullable();
    t.string("input_hash", 64).notNullable();
    t.string("output_hash", 64).nullable();
    t.jsonb("output").nullable();
    t.string("status", 20).notNullable().defaultTo("running");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("completed_at", { useTz: true }).nullable();
    t.unique(["view_name", "scope", "input_hash", "code_version", "config_hash"], { indexName: "uq_view_deterministic_run" });
  });
  await knex.schema.createTable("materialized_view_checkpoints", (t) => {
    t.uuid("view_version_id").primary().references("id").inTable("materialized_view_versions");
    t.string("last_event_identity", 64).nullable();
    t.integer("processed_count").notNullable().defaultTo(0);
    t.jsonb("state").notNullable().defaultTo("{}");
    t.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("materialized_view_promotions", (t) => {
    t.string("view_name", 128).notNullable();
    t.string("scope", 256).notNullable();
    t.uuid("view_version_id").notNullable().references("id").inTable("materialized_view_versions");
    t.timestamp("promoted_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.primary(["view_name", "scope"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  for (const table of ["materialized_view_promotions", "materialized_view_checkpoints", "materialized_view_versions", "bitemporal_observations", "canonical_event_collisions", "canonical_event_raw_payloads", "canonical_event_aliases", "canonical_chain_events", "ingestion_barrier_overrides", "ingestion_dependency_barriers", "ingestion_source_watermarks"]) await knex.schema.dropTableIfExists(table);
}
