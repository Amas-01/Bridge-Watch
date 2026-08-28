import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("rpc_method_capabilities", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("rpc_endpoint_url").notNullable();
    table.string("method_name").notNullable();
    table.boolean("is_supported").notNullable();
    table.timestamp("discovered_at").notNullable();
    table.timestamp("last_checked_at").notNullable();
    table.jsonb("response_schema").nullable();
    table.timestamps(true, true);

    table.unique(["rpc_endpoint_url", "method_name"]);
    table.index(["rpc_endpoint_url", "last_checked_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("rpc_method_capabilities");
}
