import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("security_event_correlations", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("title", 200).notNullable();
    table.text("description");
    table.string("severity", 30).notNullable().defaultTo("medium");
    table.string("status", 30).notNullable().defaultTo("active");
    table.jsonb("correlation_rule").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.integer("event_count").notNullable().defaultTo(0);
    table.jsonb("source_systems").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.integer("time_window_minutes").notNullable().defaultTo(60);
    table.string("created_by", 120);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["severity"]);
    table.index(["status"]);
    table.index(["created_at"]);
  });

  await knex.schema.createTable("security_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("correlation_id")
      .nullable()
      .references("id")
      .inTable("security_event_correlations")
      .onDelete("SET NULL");
    table.string("event_type", 100).notNullable();
    table.string("source", 100).notNullable();
    table.string("severity", 30).notNullable().defaultTo("medium");
    table.string("actor", 120);
    table.string("ip_address", 45);
    table.jsonb("details").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.timestamp("timestamp", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["correlation_id"]);
    table.index(["event_type"]);
    table.index(["source"]);
    table.index(["timestamp"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("security_events");
  await knex.schema.dropTableIfExists("security_event_correlations");
}
