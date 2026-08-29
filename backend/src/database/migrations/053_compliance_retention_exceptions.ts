import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("compliance_retention_exceptions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("exception_code", 120).notNullable().unique();
    table.string("title", 150).notNullable();
    table.text("reason").notNullable();
    table.string("requested_by", 120).notNullable();
    table.string("target_type", 50).notNullable();
    table.string("target_id", 120).nullable();
    table.timestamp("start_date", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("end_date", { useTz: true }).nullable();
    table.string("status", 30).notNullable().defaultTo("active");
    table.string("released_by", 120).nullable();
    table.timestamp("released_at", { useTz: true }).nullable();
    table.text("release_reason").nullable();
    table.timestamps(true, true);

    table.index(["status"], "idx_retention_exceptions_status");
    table.index(["target_type", "target_id"], "idx_retention_exceptions_target");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("compliance_retention_exceptions");
}
