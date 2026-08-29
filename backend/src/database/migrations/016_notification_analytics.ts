import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("notification_deliveries", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("notification_type").notNullable();
    table.string("channel").notNullable();
    table.string("recipient").notNullable();
    table.enum("status", ["sent", "delivered", "failed", "bounced"]).notNullable();
    table.integer("delivery_time_ms").nullable();
    table.text("error_message").nullable();
    table.jsonb("metadata").nullable();
    table.timestamp("sent_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("delivered_at").nullable();
    table.timestamps(true, true);
    table.index(["notification_type", "sent_at"]);
    table.index(["channel", "status"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("notification_deliveries");
}
