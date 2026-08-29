import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create contract_allowlist table first (referenced by change requests)
  await knex.schema.createTable("contract_allowlist", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("contract_address").notNullable().unique();
    table.string("added_by").notNullable();
    table.timestamp("added_at").notNullable().defaultTo(knex.fn.now());
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);
  });

  // Create change requests table
  await knex.schema.createTable("allowlist_change_requests", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("contract_address").notNullable();
    table.string("action").notNullable();
    table.string("reason").notNullable();
    table.string("requested_by").notNullable();
    table.string("status").notNullable().defaultTo("pending");
    table.string("reviewed_by").nullable();
    table.text("review_comment").nullable();
    table.timestamp("reviewed_at").nullable();
    table.timestamps(true, true);

    table.index(["status", "created_at"]);

    // Add check constraints
    table.check("?? IN ('add', 'remove')", ["action"]);
    table.check("?? IN ('pending', 'approved', 'rejected')", ["status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("allowlist_change_requests");
  await knex.schema.dropTableIfExists("contract_allowlist");
}
