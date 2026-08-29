import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("metric_retention_policies", (table) => {
    table.string("granularity", 20).primary();
    table.integer("retention_days").notNullable();
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex("metric_retention_policies")
    .insert([
      { granularity: "raw", retention_days: 7 },
      { granularity: "hourly", retention_days: 90 },
      { granularity: "daily", retention_days: 365 },
      { granularity: "weekly", retention_days: 1825 },
    ])
    .onConflict("granularity")
    .ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("metric_retention_policies");
}
