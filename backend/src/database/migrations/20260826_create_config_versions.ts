import type { Knex } from "knex";

/**
 * Migration: Config Version History
 * Issue: #1061
 *
 * Creates the config_versions table for immutable config version history.
 * Each time a config is changed, a new version record is inserted rather
 * than overwriting the previous state. The is_current flag marks the
 * active version (at most one true per config_key at any point in time).
 *
 * This table is independent of the configs/config_audits tables created in
 * 023_config_service.ts which track operational key-value pairs per
 * environment. config_versions tracks versioned named configurations
 * (identified by config_key) that can be snapshotted and rolled back.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("config_versions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // Namespaced configuration identifier, e.g. "alert-thresholds", "sampling-config"
    table.string("config_key", 255).notNullable();

    // Monotonically increasing integer per config_key
    // New versions increment this; rollbacks also create new higher-numbered versions
    table.integer("version_number").notNullable();

    // Full configuration state at this version (arbitrary JSON)
    table.jsonb("payload").notNullable().defaultTo("{}");

    // Optional human-readable summary of what changed in this version
    table.text("change_summary").nullable();

    // Identity of the admin who applied this version
    table.string("applied_by", 255).notNullable();

    // When this version was applied; defaults to now()
    table
      .timestamp("applied_at", { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());

    // Exactly one record per config_key should have is_current=true
    // Enforced programmatically in ConfigVersionService.applyRollback()
    table.boolean("is_current").notNullable().defaultTo(false);

    // Compound uniqueness: (config_key, version_number) identifies a specific snapshot
    table.unique(
      ["config_key", "version_number"],
      { indexName: "config_versions_key_version_uniq" }
    );

    // Timeline queries: all versions for a config_key ordered by version_number
    table.index(["config_key", "version_number"], "config_versions_key_version_idx");

    // Fast lookup of current version per key
    table.index(["config_key", "is_current"], "config_versions_key_current_idx");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("config_versions");
}
