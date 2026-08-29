import type { Knex } from "knex";

/**
 * #1019 — Signed evidence bundles and append-only transparency log.
 *
 *   evidence_bundle_signing_keys   rotating Ed25519 signer keys + lifecycle
 *   transparency_log_entries       append-only, sequential RFC 6962 leaves
 *   transparency_log_checkpoints   signed tree heads (STH) per tree size
 *   evidence_bundles               canonical core + disclosed material per report
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("evidence_bundle_signing_keys", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("key_id", 100).notNullable().unique();
    table.string("algorithm", 40).notNullable().defaultTo("ed25519");
    table.string("purpose", 40).notNullable().defaultTo("bundle_signer"); // bundle_signer | log
    table.text("public_key_hex").notNullable();
    table.text("private_key_hex").notNullable(); // never returned by the API
    table.string("status", 20).notNullable().defaultTo("active"); // active | superseded | revoked
    table.timestamp("valid_from", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("valid_until", { useTz: true });
    table.string("rotates_key_id", 100);
    table.string("superseded_by_key_id", 100);
    table.timestamp("revoked_at", { useTz: true });
    table.text("revocation_reason");
    table.bigInteger("log_entry_index");
    table.string("created_by", 120);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["purpose", "status"]);
  });

  await knex.schema.createTable("transparency_log_entries", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("log_id", 60).notNullable().defaultTo("primary");
    table.bigInteger("log_index").notNullable();
    table.string("entry_type", 40).notNullable(); // evidence_bundle | key_registration | key_revocation
    table.text("leaf_hash").notNullable();
    table.jsonb("entry_data").notNullable();
    table.bigInteger("tree_size").notNullable();
    table.text("root_hash").notNullable();
    table.string("bundle_id", 100);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(["log_id", "log_index"]);
    table.index(["log_id", "entry_type"]);
    table.index(["bundle_id"]);
  });

  await knex.schema.createTable("transparency_log_checkpoints", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("log_id", 60).notNullable().defaultTo("primary");
    table.bigInteger("tree_size").notNullable();
    table.text("root_hash").notNullable();
    table.timestamp("timestamp", { useTz: true }).notNullable();
    table.string("log_key_id", 100).notNullable();
    table.text("log_public_key_hex").notNullable();
    table.text("signature").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(["log_id", "tree_size"]);
  });

  await knex.schema.createTable("evidence_bundles", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("bundle_id", 100).notNullable().unique();
    table.string("subject_type", 80).notNullable();
    table.string("subject_id", 120).notNullable();
    table.string("report_type", 80);
    table.timestamp("period_start", { useTz: true });
    table.timestamp("period_end", { useTz: true });
    table.string("bundle_format_version", 20).notNullable().defaultTo("1.0");
    table.text("evidence_root").notNullable();
    table.text("inputs_root").notNullable();
    table.text("signature").notNullable();
    table.string("signer_key_id", 100).notNullable();
    table.jsonb("core_json").notNullable();
    table.jsonb("disclosed_sections_json").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.jsonb("disclosed_outputs_json").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.bigInteger("log_entry_index");
    table.string("created_by", 120);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["subject_type", "subject_id"]);
    table.index(["evidence_root"]);
    table.index(["created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("evidence_bundles");
  await knex.schema.dropTableIfExists("transparency_log_checkpoints");
  await knex.schema.dropTableIfExists("transparency_log_entries");
  await knex.schema.dropTableIfExists("evidence_bundle_signing_keys");
}
