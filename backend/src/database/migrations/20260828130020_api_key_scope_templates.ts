import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Reusable scope templates let operators define named bundles of scopes that
  // can be applied when creating API keys (e.g. "monitor", "integration").
  await knex.schema.createTable("api_key_scope_templates", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 120).notNullable();
    table.text("description");
    table.jsonb("scopes").notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    table.integer("rate_limit_per_minute");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.string("created_by", 120);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(["name"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("api_key_scope_templates");
}
