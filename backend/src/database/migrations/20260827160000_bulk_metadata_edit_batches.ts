import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("bulk_metadata_edit_batches", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("updated_by", 120).notNullable();
    table.integer("total_items").notNullable();
    table.integer("succeeded_count").notNullable().defaultTo(0);
    table.integer("failed_count").notNullable().defaultTo(0);
    table.jsonb("results").notNullable().defaultTo("[]");
    table.timestamp("created_at", { useTz: true }).defaultTo(knex.fn.now());

    table.index(["updated_by"], "idx_bulk_metadata_edit_batches_updated_by");
    table.index(["created_at"], "idx_bulk_metadata_edit_batches_created_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("bulk_metadata_edit_batches");
}
