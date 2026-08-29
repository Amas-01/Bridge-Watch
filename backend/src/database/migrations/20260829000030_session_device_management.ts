import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("user_session_devices", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("user_id", 120).notNullable();
    table.string("device_fingerprint", 120).notNullable();
    table.string("device_name", 120).notNullable();
    table.string("device_type", 40).notNullable().defaultTo("DESKTOP");
    table.string("ip_address", 60).notNullable();
    table.string("location", 120);
    table.text("user_agent");
    table.boolean("is_active").notNullable().defaultTo(true);
    table.boolean("is_trusted").notNullable().defaultTo(false);
    table.timestamp("last_active_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("revoked_at", { useTz: true });
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["user_id"]);
    table.index(["device_fingerprint"]);
    table.index(["is_active"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("user_session_devices");
}
