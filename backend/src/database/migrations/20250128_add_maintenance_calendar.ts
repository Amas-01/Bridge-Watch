import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("data_sources", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("source_name").notNullable().unique();
    table
      .string("source_type")
      .notNullable()
      .comment("Type: api, rpc, oracle, bridge");
    table.string("status").notNullable().defaultTo("operational");
    table.text("description");
    table.jsonb("config").defaultTo("{}");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index(["status"]);
  });

  await knex.schema.createTable("maintenance_windows", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("data_source_id")
      .notNullable()
      .references("id")
      .inTable("data_sources")
      .onDelete("CASCADE");
    table.string("title").notNullable();
    table.text("description");
    table.timestamp("scheduled_start").notNullable();
    table.timestamp("scheduled_end").notNullable();
    table.timestamp("actual_start");
    table.timestamp("actual_end");
    table
      .string("status")
      .notNullable()
      .defaultTo("scheduled")
      .comment("Status: scheduled, in_progress, completed, cancelled");
    table
      .string("impact_level")
      .notNullable()
      .comment("Impact: none, low, medium, high");
    table.boolean("notify_users").defaultTo(true);
    table.string("created_by");
    table.jsonb("metadata").defaultTo("{}");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index(["data_source_id"]);
    table.index(["status"]);
    table.index(["scheduled_start", "scheduled_end"]);
  });

  await knex.schema.createTable("maintenance_notifications", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("maintenance_window_id")
      .notNullable()
      .references("id")
      .inTable("maintenance_windows")
      .onDelete("CASCADE");
    table
      .string("notification_type")
      .notNullable()
      .comment("Type: email, webhook, in_app");
    table.timestamp("scheduled_send_at").notNullable();
    table.timestamp("sent_at");
    table.string("status").notNullable().defaultTo("pending");
    table.text("error_message");
    table.jsonb("recipients");
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index(["maintenance_window_id"]);
    table.index(["status", "scheduled_send_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("maintenance_notifications");
  await knex.schema.dropTableIfExists("maintenance_windows");
  await knex.schema.dropTableIfExists("data_sources");
}
