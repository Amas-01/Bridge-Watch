import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("rollback_readiness_checks", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("deployment_id", 255).notNullable();
    table.string("check_type", 50).notNullable();
    table.string("status", 20).notNullable().defaultTo("pending");
    table.boolean("passed").nullable();
    table.jsonb("check_criteria").notNullable();
    table.jsonb("check_result").nullable();
    table.text("failure_reason").nullable();
    table.timestamp("executed_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("deployment_id");
    table.index("check_type");
    table.index("status");
    table.unique(["deployment_id", "check_type"]);
  });

  await knex.schema.createTable("rollback_readiness_summaries", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("deployment_id", 255).notNullable().unique();
    table.integer("total_checks").notNullable().defaultTo(0);
    table.integer("passed_checks").notNullable().defaultTo(0);
    table.string("overall_status", 20).notNullable().defaultTo("pending");
    table.boolean("ready_for_rollback").notNullable().defaultTo(false);
    table.jsonb("blocked_checks").nullable();
    table.timestamp("evaluated_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("deployment_id");
    table.index("overall_status");
  });

  await knex.schema.createTable("rollback_execution_history", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("deployment_id", 255).notNullable();
    table.string("initiated_by", 255).notNullable();
    table.string("status", 20).notNullable();
    table.text("reason").nullable();
    table.jsonb("rollback_config").nullable();
    table.integer("duration_seconds").nullable();
    table.timestamp("started_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("completed_at", { useTz: true }).nullable();
    table.index("deployment_id");
    table.index("status");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("rollback_execution_history");
  await knex.schema.dropTableIfExists("rollback_readiness_summaries");
  await knex.schema.dropTableIfExists("rollback_readiness_checks");
}
