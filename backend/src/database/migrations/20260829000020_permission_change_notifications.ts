import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("permission_change_notifications", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("target_user_id", 120).notNullable();
    table.string("actor_id", 120).notNullable();
    table.string("action", 60).notNullable();
    table.string("permission_or_role", 120).notNullable();
    table.jsonb("channels").notNullable().defaultTo(knex.raw('\'["IN_APP"]\'::jsonb'));
    table.string("status", 40).notNullable().defaultTo("PENDING");
    table.jsonb("details").notNullable().defaultTo(knex.raw("'{}'::jsonb"));
    table.timestamp("read_at", { useTz: true });
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["target_user_id"]);
    table.index(["status"]);
    table.index(["created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("permission_change_notifications");
}
