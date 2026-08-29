import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Quarantine queue for records that failed parsing. Operators can review,
  // retry (re-parse), or discard (dispose) each quarantined record.
  await knex.schema.createTable("parse_quarantine_records", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("source", 120).notNullable();
    table.string("data_type", 80).notNullable();
    table.jsonb("raw_payload").notNullable();
    table.text("parse_error").notNullable();
    table.string("error_code", 100);
    table.string("status", 40).notNullable().defaultTo("quarantined")
      .checkIn(["quarantined", "in_review", "resolved", "disposed", "failed"]);
    table.integer("retry_count").notNullable().defaultTo(0);
    table.jsonb("retry_history").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.integer("priority").notNullable().defaultTo(0);
    table.string("reviewed_by", 120);
    table.text("resolution_note");
    table.timestamp("quarantined_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("reviewed_at", { useTz: true });
    table.timestamp("resolved_at", { useTz: true });
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["status"]);
    table.index(["source"]);
    table.index(["data_type"]);
    table.index(["priority"]);
    table.index(["quarantined_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("parse_quarantine_records");
}
