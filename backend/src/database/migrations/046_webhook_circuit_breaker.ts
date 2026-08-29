import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Add circuit breaker columns to webhook_endpoints
  await knex.schema.alterTable("webhook_endpoints", (table) => {
    table.integer("consecutive_failures").notNullable().defaultTo(0);
    table.string("circuit_breaker_status").notNullable().defaultTo("closed");
    table.timestamp("circuit_breaker_tripped_at", { useTz: true }).nullable();
    table.timestamp("circuit_breaker_reset_at", { useTz: true }).nullable();
  });

  // Create index for quick lookups of tripped breakers
  await knex.raw(`
    CREATE INDEX idx_webhook_endpoints_cb_status
      ON webhook_endpoints (circuit_breaker_status)
      WHERE circuit_breaker_status != 'closed'
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP INDEX IF EXISTS idx_webhook_endpoints_cb_status");

  await knex.schema.alterTable("webhook_endpoints", (table) => {
    table.dropColumn("consecutive_failures");
    table.dropColumn("circuit_breaker_status");
    table.dropColumn("circuit_breaker_tripped_at");
    table.dropColumn("circuit_breaker_reset_at");
  });
}
