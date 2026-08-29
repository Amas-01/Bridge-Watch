import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create contract event schemas table
  await knex.schema.createTable("contract_event_schemas", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("contract_id", 56).notNullable();
    table.string("event_type", 100).notNullable();
    table.jsonb("schema_json").notNullable();
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).defaultTo(knex.fn.now());

    table.unique(["contract_id", "event_type"]);
  });

  // Create matched contract events table
  await knex.schema.createTable("matched_contract_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("schema_id").notNullable()
      .references("id")
      .inTable("contract_event_schemas")
      .onDelete("CASCADE");
    table.string("tx_hash", 64).notNullable();
    table.integer("ledger_seq").notNullable();
    table.jsonb("event_data").notNullable();
    table.timestamp("matched_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["schema_id"]);
    table.index(["tx_hash"]);
    table.index(["matched_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("matched_contract_events");
  await knex.schema.dropTableIfExists("contract_event_schemas");
}
