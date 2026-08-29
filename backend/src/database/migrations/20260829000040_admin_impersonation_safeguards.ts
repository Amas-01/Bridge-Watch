import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("admin_impersonation_sessions", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("admin_id", 120).notNullable();
    table.string("impersonated_user_id", 120).notNullable();
    table.text("reason").notNullable();
    table.string("approval_ticket_id", 120);
    table.string("status", 40).notNullable().defaultTo("ACTIVE");
    table.string("token_hash", 120).notNullable();
    table.integer("max_duration_minutes").notNullable().defaultTo(30);
    table.timestamp("expires_at", { useTz: true }).notNullable();
    table.timestamp("ended_at", { useTz: true });
    table.string("ip_address", 60).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["admin_id"]);
    table.index(["impersonated_user_id"]);
    table.index(["status"]);
    table.index(["expires_at"]);
  });

  await knex.schema.createTable("admin_impersonation_audit_logs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("impersonation_session_id").notNullable().references("id").inTable("admin_impersonation_sessions").onDelete("CASCADE");
    table.string("admin_id", 120).notNullable();
    table.string("impersonated_user_id", 120).notNullable();
    table.string("action_performed", 120).notNullable();
    table.text("request_path").notNullable();
    table.string("request_method", 20).notNullable();
    table.timestamp("timestamp", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["impersonation_session_id"]);
    table.index(["admin_id"]);
    table.index(["timestamp"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("admin_impersonation_audit_logs");
  await knex.schema.dropTableIfExists("admin_impersonation_sessions");
}
