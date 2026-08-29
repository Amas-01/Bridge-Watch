import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("data_corrections", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("requester_address").notNullable();
    table.string("approver_address").nullable();
    table.string("data_type").notNullable();
    table.string("entity_id").notNullable();
    table.jsonb("original_data").notNullable();
    table.jsonb("corrected_data").notNullable();
    table.string("reason").notNullable();
    table.enum("status", ["pending", "approved", "rejected"]).notNullable().defaultTo("pending");
    table.text("rejection_reason").nullable();
    table.timestamp("requested_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("decided_at").nullable();
    table.timestamps(true, true);
    table.index(["status", "requested_at"]);
    table.index(["requester_address"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("data_corrections");
}
