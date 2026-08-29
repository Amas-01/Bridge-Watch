import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("promotion_gates", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("source_environment", 50).notNullable();
    table.string("target_environment", 50).notNullable();
    table.string("gate_name", 255).notNullable();
    table.string("gate_type", 50).notNullable();
    table.string("status", 20).notNullable().defaultTo("active");
    table.jsonb("gate_criteria").notNullable();
    table.integer("approval_count").notNullable().defaultTo(0);
    table.integer("required_approvals").notNullable().defaultTo(1);
    table.string("approval_roles").notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("source_environment");
    table.index("target_environment");
    table.index("gate_type");
    table.unique(["source_environment", "target_environment", "gate_name"]);
  });

  await knex.schema.createTable("promotion_history", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("deployment_id", 255).notNullable();
    table.string("version", 50).notNullable();
    table.string("source_environment", 50).notNullable();
    table.string("target_environment", 50).notNullable();
    table.string("status", 20).notNullable().defaultTo("pending");
    table.jsonb("gate_results").nullable();
    table.integer("passed_gates").notNullable().defaultTo(0);
    table.integer("total_gates").notNullable().defaultTo(0);
    table.text("reason_denied").nullable();
    table.timestamp("requested_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("approved_at", { useTz: true }).nullable();
    table.timestamp("promoted_at", { useTz: true }).nullable();
    table.index("deployment_id");
    table.index("status");
    table.index("source_environment");
    table.index("target_environment");
  });

  await knex.schema.createTable("promotion_approvals", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("promotion_id").notNullable().references("id").inTable("promotion_history").onDelete("cascade");
    table.string("approver_id", 255).notNullable();
    table.string("decision", 20).notNullable();
    table.text("comment").nullable();
    table.timestamp("approved_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("promotion_id");
    table.index("approver_id");
  });

  await knex.schema.createTable("gate_execution_logs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("gate_id").notNullable().references("id").inTable("promotion_gates").onDelete("cascade");
    table.uuid("promotion_id").notNullable().references("id").inTable("promotion_history").onDelete("cascade");
    table.string("execution_status", 20).notNullable();
    table.boolean("passed").notNullable().defaultTo(false);
    table.jsonb("execution_result").nullable();
    table.integer("duration_ms").nullable();
    table.timestamp("executed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("gate_id");
    table.index("promotion_id");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("gate_execution_logs");
  await knex.schema.dropTableIfExists("promotion_approvals");
  await knex.schema.dropTableIfExists("promotion_history");
  await knex.schema.dropTableIfExists("promotion_gates");
}
