import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("unconfirmed_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("source_chain").notNullable();
    table.string("event_type").notNullable();
    table.jsonb("payload").notNullable();
    table.string("tx_hash").notNullable();
    table.bigInteger("ledger_sequence").notNullable();
    table.bigInteger("observed_ledger").notNullable();
    table.integer("confirmations").notNullable().defaultTo(0);
    table.integer("required_confirmations").notNullable();
    table.boolean("is_confirmed").notNullable().defaultTo(false);
    table.boolean("is_rolled_back").notNullable().defaultTo(false);
    table.timestamp("observed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("confirmed_at", { useTz: true }).nullable();
    table.timestamp("rolled_back_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["source_chain", "is_confirmed"], "idx_unconfirmed_events_chain_confirmed");
    table.index(["tx_hash", "source_chain"], "idx_unconfirmed_events_tx_chain");
    table.index(["ledger_sequence"], "idx_unconfirmed_events_ledger");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("unconfirmed_events");
}
