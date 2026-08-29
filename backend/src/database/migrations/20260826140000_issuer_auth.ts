import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create issuer auth states table
  await knex.schema.createTable("issuer_auth_states", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("issuer_address", 56).notNullable();
    table.string("asset_code", 12).notNullable();
    table.boolean("auth_required").notNullable().defaultTo(false);
    table.boolean("auth_revocable").notNullable().defaultTo(false);
    table.boolean("auth_clawback_enabled").notNullable().defaultTo(false);
    table.boolean("auth_immutable").notNullable().defaultTo(false);
    table.timestamp("last_checked_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["issuer_address", "asset_code"]);
    table.index(["last_checked_at"]);
  });

  // Create issuer auth alerts table
  await knex.schema.createTable("issuer_auth_alerts", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("issuer_address", 56).notNullable();
    table.string("asset_code", 12).notNullable();
    table.string("alert_type", 100).notNullable();
    table.string("severity", 50).notNullable(); // 'low', 'medium', 'high', 'critical'
    table.text("description").nullable();
    table.boolean("resolved").notNullable().defaultTo(false);
    table.timestamp("resolved_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["issuer_address"]);
    table.index(["resolved"]);
    table.index(["created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("issuer_auth_alerts");
  await knex.schema.dropTableIfExists("issuer_auth_states");
}
