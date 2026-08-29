import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("anomaly_tuning_profiles", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name").notNullable().unique();
    table.decimal("deviation_multiplier", 8, 3).notNullable().defaultTo(3);
    table.integer("sliding_window_size").notNullable().defaultTo(20);
    table.boolean("is_active").notNullable().defaultTo(false);
    table.string("updated_by").nullable();
    table.timestamps(true, true);

    table.check("deviation_multiplier > 0");
    table.check("sliding_window_size >= 3 AND sliding_window_size <= 1000");
    table.index(["is_active"]);
  });

  await knex.schema.createTable("anomaly_tuning_overrides", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("anomaly_type").notNullable().defaultTo("*");
    table.string("asset_code").notNullable().defaultTo("*");
    table.string("bridge_name").notNullable().defaultTo("*");
    table.text("reason").notNullable();
    table.timestamp("starts_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("expires_at").notNullable();
    table.string("created_by").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.check("expires_at > starts_at");
    table.index(["starts_at", "expires_at"]);
    table.index(["asset_code", "bridge_name", "anomaly_type"]);
  });

  await knex("anomaly_tuning_profiles").insert({
    name: "default",
    deviation_multiplier: 3,
    sliding_window_size: 20,
    is_active: true,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("anomaly_tuning_overrides");
  await knex.schema.dropTableIfExists("anomaly_tuning_profiles");
}
