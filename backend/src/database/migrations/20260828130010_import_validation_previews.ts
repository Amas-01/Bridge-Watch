import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Stored import validation previews allow operators to run validation on an
  // incoming dataset and inspect the result before committing an import.
  await knex.schema.createTable("import_validation_previews", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("data_type", 80).notNullable();
    table.integer("row_count").notNullable();
    table.integer("valid_count").notNullable().defaultTo(0);
    table.integer("invalid_count").notNullable().defaultTo(0);
    table.integer("warning_count").notNullable().defaultTo(0);
    table.double("data_quality_score").notNullable().defaultTo(0);
    table.jsonb("errors").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.jsonb("warnings").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.jsonb("summary").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.string("created_by", 120);
    table.boolean("applied").notNullable().defaultTo(false);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["data_type"]);
    table.index(["created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("import_validation_previews");
}
