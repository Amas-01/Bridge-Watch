import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("sensitive_field_definitions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("resource_name", 100).notNullable();
    table.string("field_name", 100).notNullable();
    table.string("sensitivity_level", 30).notNullable().defaultTo("medium");
    table.text("description");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(["resource_name", "field_name"]);
    table.index(["resource_name"]);
    table.index(["sensitivity_level"]);
  });

  await knex.schema.createTable("sensitive_field_access_logs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("resource_name", 100).notNullable();
    table.string("field_name", 100).notNullable();
    table.string("actor_id", 120).notNullable();
    table.string("actor_role", 60).notNullable().defaultTo("operator");
    table.string("access_type", 30).notNullable().defaultTo("read");
    table.text("reason");
    table.string("ip_address", 45);
    table.text("user_agent");
    table.timestamp("timestamp", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["resource_name", "field_name"]);
    table.index(["actor_id"]);
    table.index(["timestamp"]);
  });

  await knex.schema.createTable("sensitive_field_access_reports", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("title", 200).notNullable();
    table.timestamp("time_range_start", { useTz: true }).notNullable();
    table.timestamp("time_range_end", { useTz: true }).notNullable();
    table.string("sensitivity_filter", 30);
    table.integer("total_accesses").notNullable().defaultTo(0);
    table.integer("unique_actors").notNullable().defaultTo(0);
    table.integer("critical_accesses").notNullable().defaultTo(0);
    table.jsonb("summary_json").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.string("generated_by", 120).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("sensitive_field_access_reports");
  await knex.schema.dropTableIfExists("sensitive_field_access_logs");
  await knex.schema.dropTableIfExists("sensitive_field_definitions");
}
