import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create clusters table
  await knex.schema.createTable("stellar_account_clusters", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 255).notNullable().unique();
    table.string("risk_level", 50).notNullable(); // 'low', 'moderate', 'high', 'critical'
    table.text("description").nullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());
  });

  // Create cluster mappings table
  await knex.schema.createTable("stellar_account_cluster_mappings", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("cluster_id").notNullable()
      .references("id")
      .inTable("stellar_account_clusters")
      .onDelete("CASCADE");
    table.string("account_address", 56).notNullable().unique();
    table.text("reason").nullable();
    table.decimal("confidence_score", 5, 2).notNullable().defaultTo(1.0);
    table.string("added_by", 255).notNullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["cluster_id"]);
    table.index(["account_address"]);
  });

  // Create risk signals table
  await knex.schema.createTable("account_risk_signals", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("account_address", 56).notNullable();
    table.string("signal_type", 100).notNullable();
    table.string("severity", 50).notNullable(); // 'info', 'low', 'medium', 'high', 'critical'
    table.text("description").nullable();
    table.timestamp("detected_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["account_address"]);
    table.index(["detected_at"]);
    table.index(["severity"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("account_risk_signals");
  await knex.schema.dropTableIfExists("stellar_account_cluster_mappings");
  await knex.schema.dropTableIfExists("stellar_account_clusters");
}
