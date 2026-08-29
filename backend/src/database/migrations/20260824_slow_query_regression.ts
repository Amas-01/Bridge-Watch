import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("slow_query_baselines", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("query_name", 255).notNullable();
    table.string("query_hash", 64).notNullable().unique();
    table.integer("baseline_ms").notNullable();
    table.integer("threshold_ms").notNullable();
    table.float("variance_threshold").notNullable().defaultTo(0.2);
    table.string("status", 20).notNullable().defaultTo("active");
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("query_name");
    table.index("status");
  });

  await knex.schema.createTable("slow_query_observations", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("baseline_id").notNullable().references("id").inTable("slow_query_baselines").onDelete("cascade");
    table.integer("execution_ms").notNullable();
    table.float("variance_pct").notNullable();
    table.boolean("is_regression").notNullable().defaultTo(false);
    table.text("query_details").nullable();
    table.timestamp("observed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("baseline_id");
    table.index("is_regression");
    table.index("observed_at");
  });

  await knex.schema.createTable("slow_query_alerts", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("baseline_id").notNullable().references("id").inTable("slow_query_baselines").onDelete("cascade");
    table.string("severity", 20).notNullable();
    table.integer("observation_count").notNullable().defaultTo(1);
    table.integer("max_duration_ms").notNullable();
    table.float("avg_variance_pct").notNullable();
    table.string("status", 20).notNullable().defaultTo("active");
    table.timestamp("first_observed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("resolved_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("baseline_id");
    table.index("status");
    table.index("severity");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("slow_query_alerts");
  await knex.schema.dropTableIfExists("slow_query_observations");
  await knex.schema.dropTableIfExists("slow_query_baselines");
}
