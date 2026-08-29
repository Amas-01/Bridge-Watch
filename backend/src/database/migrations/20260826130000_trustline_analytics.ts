import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create trustline snapshots table
  await knex.schema.createTable("trustline_snapshots", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("asset_code", 12).notNullable();
    table.string("asset_issuer", 56).notNullable();
    table.integer("total_trustlines").notNullable().defaultTo(0);
    table.integer("active_trustlines").notNullable().defaultTo(0);
    table.decimal("total_balance", 20, 7).notNullable().defaultTo(0);
    table.timestamp("snapshot_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["asset_code", "asset_issuer"]);
    table.index(["snapshot_at"]);
  });

  // Create concentration metrics table
  await knex.schema.createTable("trustline_concentration_metrics", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("snapshot_id").notNullable()
      .references("id")
      .inTable("trustline_snapshots")
      .onDelete("CASCADE");
    table.string("percentile", 50).notNullable(); // 'top_10', 'top_50', 'top_100'
    table.decimal("balance_percentage", 5, 2).notNullable(); // 0.00 to 100.00
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["snapshot_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("trustline_concentration_metrics");
  await knex.schema.dropTableIfExists("trustline_snapshots");
}
