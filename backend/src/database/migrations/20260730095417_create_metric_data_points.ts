import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("metric_data_points", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("metric_key", 120).notNullable();
    table.decimal("value", 20, 6).notNullable();
    table.jsonb("tags").notNullable().defaultTo("{}");
    table.timestamp("recorded_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["metric_key", "recorded_at"], "idx_metric_points_key_time");
    table.index(["recorded_at"], "idx_metric_points_recorded_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("metric_data_points");
}
