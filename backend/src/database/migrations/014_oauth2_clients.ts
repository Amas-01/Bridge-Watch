import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table("api_keys", (table) => {
    table.string("client_id").nullable().unique();
    table.string("client_secret_hash").nullable();
    table.boolean("oauth_enabled").notNullable().defaultTo(false);
  });

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_api_keys_client_id 
    ON api_keys(client_id) 
    WHERE client_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table("api_keys", (table) => {
    table.dropColumn("client_id");
    table.dropColumn("client_secret_hash");
    table.dropColumn("oauth_enabled");
  });
}
