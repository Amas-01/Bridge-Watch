import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("canary_deployments", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("deployment_name", 255).notNullable();
    table.string("version", 50).notNullable();
    table.string("environment", 50).notNullable();
    table.string("status", 20).notNullable().defaultTo("running");
    table.jsonb("deployment_config").notNullable();
    table.integer("traffic_percentage").notNullable().defaultTo(10);
    table.string("baseline_version", 50).nullable();
    table.timestamp("started_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("ended_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("deployment_name");
    table.index("status");
    table.index("environment");
  });

  await knex.schema.createTable("canary_metrics", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("deployment_id").notNullable().references("id").inTable("canary_deployments").onDelete("cascade");
    table.string("metric_name", 255).notNullable();
    table.string("metric_type", 50).notNullable();
    table.float("canary_value").notNullable();
    table.float("baseline_value").notNullable();
    table.float("deviation_pct").notNullable();
    table.float("threshold_pct").notNullable();
    table.boolean("within_threshold").notNullable();
    table.timestamp("measured_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("deployment_id");
    table.index("metric_name");
    table.index("within_threshold");
  });

  await knex.schema.createTable("canary_metric_comparisons", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("deployment_id").notNullable().references("id").inTable("canary_deployments").onDelete("cascade");
    table.string("comparison_status", 20).notNullable().defaultTo("in_progress");
    table.integer("total_metrics").notNullable().defaultTo(0);
    table.integer("healthy_metrics").notNullable().defaultTo(0);
    table.float("overall_deviation_pct").notNullable().defaultTo(0);
    table.jsonb("anomalies").nullable();
    table.string("recommendation", 20).notNullable().defaultTo("continue_monitoring");
    table.timestamp("evaluated_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("deployment_id");
    table.index("comparison_status");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("canary_metric_comparisons");
  await knex.schema.dropTableIfExists("canary_metrics");
  await knex.schema.dropTableIfExists("canary_deployments");
}
