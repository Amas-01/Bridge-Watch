import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("contract_storage_snapshots", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("contract_id", 56).notNullable();
    table.string("label").nullable();
    table.integer("ledger_seq").notNullable();
    table.integer("persistent_entries").notNullable().defaultTo(0);
    table.integer("temporary_entries").notNullable().defaultTo(0);
    table.integer("instance_entries").notNullable().defaultTo(0);
    table.bigInteger("total_size_bytes").notNullable().defaultTo(0);
    table.integer("min_rent_expiration_ledger").nullable();
    table.timestamp("recorded_at").notNullable().defaultTo(knex.fn.now());

    table.index(["contract_id", "recorded_at"], "idx_contract_storage_contract_time");
    table.index(["recorded_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("contract_storage_snapshots");
}
