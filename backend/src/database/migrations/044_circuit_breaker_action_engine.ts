import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("circuit_breaker_action_configs", (table) => {
    table.string("id").primary();
    table.string("name").notNullable();
    table.string("alert_type").notNullable(); // price_deviation, supply_mismatch, bridge_downtime, volume_spike, reserve_ratio, health_score, all
    table.enum("action_type", ["script", "webhook", "contract_pause"]).notNullable();
    table.text("config").notNullable(); // JSON string with command/url/contractId parameters
    table.boolean("enabled").defaultTo(true).notNullable();
    table.integer("timeout_ms").defaultTo(30000).notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index(["alert_type"]);
    table.index(["enabled"]);
  });

  await knex.schema.createTable("circuit_breaker_action_logs", (table) => {
    table.string("id").primary();
    table.string("action_config_id").notNullable();
    table.string("trigger_id");
    table.string("alert_id");
    table.string("alert_type").notNullable();
    table.string("action_type").notNullable();
    table.enum("status", ["pending", "success", "failed"]).notNullable();
    table.text("output");
    table.text("error_message");
    table.integer("execution_time_ms").notNullable().defaultTo(0);
    table.timestamp("executed_at").defaultTo(knex.fn.now());

    table.index(["action_config_id"]);
    table.index(["alert_type"]);
    table.index(["status"]);
    table.index(["executed_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("circuit_breaker_action_logs");
  await knex.schema.dropTableIfExists("circuit_breaker_action_configs");
}
