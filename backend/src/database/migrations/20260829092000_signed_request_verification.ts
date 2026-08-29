import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("request_signing_keys", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("key_id", 100).notNullable().unique();
    table.text("secret").notNullable();
    table.string("algorithm", 40).notNullable().defaultTo("hmac-sha256");
    table.string("owner", 120).notNullable();
    table.integer("max_clock_skew_seconds").notNullable().defaultTo(300);
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["key_id"]);
    table.index(["is_active"]);
  });

  await knex.schema.createTable("signed_request_logs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("key_id", 100).notNullable();
    table.string("request_path", 255).notNullable();
    table.string("request_method", 10).notNullable();
    table.text("signature").notNullable();
    table.string("status", 40).notNullable().defaultTo("valid");
    table.string("client_ip", 45);
    table.text("error_message");
    table.timestamp("timestamp", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["key_id"]);
    table.index(["status"]);
    table.index(["timestamp"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("signed_request_logs");
  await knex.schema.dropTableIfExists("request_signing_keys");
}
