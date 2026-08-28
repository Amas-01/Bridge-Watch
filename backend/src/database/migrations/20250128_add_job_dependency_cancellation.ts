import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("job_definitions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("job_name").notNullable().unique();
    table.string("job_type").notNullable();
    table.text("description");
    table.jsonb("config").defaultTo("{}");
    table.boolean("is_active").defaultTo(true);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("job_dependencies", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("job_id")
      .notNullable()
      .references("id")
      .inTable("job_definitions")
      .onDelete("CASCADE");
    table
      .uuid("depends_on_job_id")
      .notNullable()
      .references("id")
      .inTable("job_definitions")
      .onDelete("CASCADE");
    table
      .string("dependency_type")
      .notNullable()
      .defaultTo("blocking")
      .comment("Type: blocking, soft");
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.unique(["job_id", "depends_on_job_id"]);
    table.index(["job_id"]);
    table.index(["depends_on_job_id"]);
  });

  await knex.schema.createTable("job_executions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("job_definition_id")
      .notNullable()
      .references("id")
      .inTable("job_definitions")
      .onDelete("CASCADE");
    table.string("execution_id").notNullable().unique();
    table
      .string("status")
      .notNullable()
      .defaultTo("pending")
      .comment("Status: pending, running, completed, failed, cancelled");
    table.timestamp("started_at");
    table.timestamp("completed_at");
    table.text("error_message");
    table.jsonb("input_params").defaultTo("{}");
    table.jsonb("output_result").defaultTo("{}");
    table.jsonb("metadata").defaultTo("{}");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index(["job_definition_id", "status"]);
    table.index(["status"]);
    table.index(["created_at"]);
  });

  await knex.schema.createTable("job_cancellations", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("job_execution_id")
      .notNullable()
      .references("id")
      .inTable("job_executions")
      .onDelete("CASCADE");
    table.string("cancellation_reason").notNullable();
    table.string("cancelled_by");
    table.boolean("cascade_to_dependents").defaultTo(true);
    table
      .jsonb("affected_jobs")
      .defaultTo("[]")
      .comment("List of dependent job IDs that were cancelled");
    table.timestamp("cancelled_at").defaultTo(knex.fn.now());
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index(["job_execution_id"]);
    table.index(["cancelled_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("job_cancellations");
  await knex.schema.dropTableIfExists("job_executions");
  await knex.schema.dropTableIfExists("job_dependencies");
  await knex.schema.dropTableIfExists("job_definitions");
}
