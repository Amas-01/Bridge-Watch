import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("incident_ownership_transfers", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .string("incident_id")
      .notNullable()
      .references("id")
      .inTable("incidents")
      .onDelete("CASCADE");
    table.string("from_operator", 120).nullable();
    table.string("to_operator", 120).notNullable();
    table.string("initiated_by", 120).notNullable();
    table.text("reason").nullable();
    table.timestamp("transferred_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["incident_id"], "idx_incident_ownership_transfers_incident");
    table.index(["to_operator"], "idx_incident_ownership_transfers_to_operator");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("incident_ownership_transfers");
}
