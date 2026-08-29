import type { Knex } from "knex";

/**
 * Migration manifest table for the zero-gap hot-to-cold time-series migration protocol.
 *
 * Each row represents one archival segment: a contiguous time range for one entity type
 * (prices, health_scores, liquidity_snapshots, …).  The manifest is the single source of
 * truth for migration state, enabling idempotent resume after failure and duplicate-free
 * cutover.
 *
 * Lifecycle:
 *   pending → migrating → verifying → complete
 *                     ↘ failed → rolled_back
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("migration_manifests", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    t.string("entity_type", 50).notNullable();
    t.string("archive_table", 100).notNullable();

    t.timestamp("range_start", { useTz: true }).notNullable();
    t.timestamp("range_end", { useTz: true }).notNullable();

    // 'pending' | 'migrating' | 'verifying' | 'complete' | 'failed' | 'rolled_back'
    t.string("status", 20).notNullable().defaultTo("pending");

    t.integer("schema_version").notNullable();
    t.bigInteger("row_count").nullable();

    // SHA-256 hex of canonical row content — proves archive integrity
    t.string("checksum", 64).nullable();

    t.text("error_message").nullable();

    t.timestamp("started_at", { useTz: true }).nullable();
    t.timestamp("completed_at", { useTz: true }).nullable();
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    // Prevent duplicate manifests for the exact same segment
    t.unique(["entity_type", "range_start", "range_end"]);

    t.index(["entity_type", "status"], "idx_migration_manifests_entity_status");
    t.index(["status", "created_at"], "idx_migration_manifests_status_created");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("migration_manifests");
}
