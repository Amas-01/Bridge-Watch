import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("soroban_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("cursor").notNullable().unique();
    table.integer("ledger").notNullable();
    table.timestamp("ledger_closed_at").notNullable();
    table.string("contract_id").notNullable();
    table.string("topic").notNullable();
    table.jsonb("value").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX soroban_events_contract_idx ON soroban_events(contract_id, ledger_closed_at DESC);");
  await knex.raw("SELECT create_hypertable('soroban_events', 'ledger_closed_at', if_not_exists => TRUE);");
  await knex.raw("SELECT add_retention_policy('soroban_events', INTERVAL '90 days', if_not_exists => TRUE);");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("soroban_events");
}
