import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create token decimal snapshots table
  await knex.schema.createTable("token_decimal_snapshots", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("token_address").notNullable();
    table.integer("decimals").notNullable();
    table.timestamp("snapshotted_at").notNullable().defaultTo(knex.fn.now());
    table.string("chain_id").notNullable();
    table.timestamps(true, true);

    table.index(["token_address", "snapshotted_at"]);
  });

  // Create token decimal change alerts table
  await knex.schema.createTable("token_decimal_change_alerts", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("token_address").notNullable();
    table.integer("previous_decimals").notNullable();
    table.integer("new_decimals").notNullable();
    table.timestamp("detected_at").notNullable().defaultTo(knex.fn.now());
    table.string("alert_status").notNullable().defaultTo("open");
    table.string("acknowledged_by").nullable();
    table.timestamp("resolved_at").nullable();
    table.timestamps(true, true);

    table.index(["alert_status", "detected_at"]);

    // Add check constraint for status
    table.check("?? IN ('open', 'acknowledged', 'resolved')", ["alert_status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("token_decimal_change_alerts");
  await knex.schema.dropTableIfExists("token_decimal_snapshots");
}
