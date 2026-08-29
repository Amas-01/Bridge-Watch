import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("webhook_ip_allowlists", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table
      .uuid("webhook_endpoint_id")
      .nullable()
      .references("id")
      .inTable("webhook_endpoints")
      .onDelete("CASCADE");
    table.string("ip_or_cidr", 60).notNullable();
    table.text("description");
    table.string("direction", 20).notNullable().defaultTo("inbound");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.string("created_by", 120);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["webhook_endpoint_id"]);
    table.index(["ip_or_cidr"]);
    table.index(["direction"]);
    table.index(["is_active"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("webhook_ip_allowlists");
}
