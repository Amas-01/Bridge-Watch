import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("login_risk_signals", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("user_address").notNullable();
    table.string("signal_type").notNullable();
    table.string("risk_level").notNullable();
    table.jsonb("metadata").nullable();
    table.timestamp("detected_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("resolved_at").nullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamps(true, true);
    table.index(["user_address", "is_active"]);
    table.index(["risk_level", "detected_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("login_risk_signals");
}
