import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("third_party_incidents", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .string("source")
      .notNullable()
      .comment("Third-party incident source (e.g., StatusPage, PagerDuty)");
    table
      .string("external_id")
      .notNullable()
      .comment("External incident ID from the source");
    table.string("title").notNullable();
    table.text("description");
    table
      .string("status")
      .notNullable()
      .comment(
        "Incident status: investigating, identified, monitoring, resolved",
      );
    table
      .string("severity")
      .notNullable()
      .comment("Severity level: minor, major, critical");
    table.string("affected_component");
    table.timestamp("incident_started_at").notNullable();
    table.timestamp("incident_resolved_at");
    table.jsonb("metadata").defaultTo("{}");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.unique(["source", "external_id"]);
    table.index(["status"]);
    table.index(["severity"]);
    table.index(["incident_started_at"]);
  });

  await knex.schema.createTable("incident_status_updates", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("incident_id")
      .notNullable()
      .references("id")
      .inTable("third_party_incidents")
      .onDelete("CASCADE");
    table.string("status").notNullable();
    table.text("message");
    table.timestamp("update_timestamp").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.index(["incident_id", "update_timestamp"]);
  });

  await knex.schema.createTable("incident_ingestion_sources", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("source_name").notNullable().unique();
    table
      .string("source_type")
      .notNullable()
      .comment("Type: statuspage, pagerduty, custom_api");
    table.string("api_endpoint").notNullable();
    table
      .string("auth_type")
      .notNullable()
      .comment("Auth type: api_key, oauth, basic");
    table.text("credentials_encrypted");
    table.boolean("is_active").defaultTo(true);
    table.integer("poll_interval_seconds").defaultTo(300);
    table.timestamp("last_poll_at");
    table.timestamp("last_success_at");
    table.text("last_error");
    table.jsonb("config").defaultTo("{}");
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index(["is_active"]);
    table.index(["last_poll_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("incident_status_updates");
  await knex.schema.dropTableIfExists("third_party_incidents");
  await knex.schema.dropTableIfExists("incident_ingestion_sources");
}
