import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("backfill_jobs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("source_id").notNullable();
    table.string("status").notNullable().defaultTo("PENDING"); // PENDING, RUNNING, COMPLETED, FAILED
    table.integer("range_start").notNullable();
    table.integer("range_end").notNullable();
    table.integer("chunk_size").notNullable();
    table.jsonb("completed_chunks").defaultTo("[]");
    table.jsonb("failed_chunks").defaultTo("[]");
    table.timestamp("started_at");
    table.timestamp("completed_at");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  await knex.raw("CREATE INDEX backfill_jobs_source_idx ON backfill_jobs(source_id);");
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("backfill_jobs");
}
