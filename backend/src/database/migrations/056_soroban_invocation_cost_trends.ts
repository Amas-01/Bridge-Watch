import type { Knex } from "knex";

/**
 * Soroban Invocation Cost Trends (#1089)
 * Tracks and analyzes cost metrics for Soroban contract invocations.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("soroban_invocation_costs", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("contract_id", 120).notNullable();
    table.string("function_name", 100).notNullable();

    // Invocation details
    table.string("transaction_hash", 100).notNullable();
    table.bigInteger("ledger_sequence").notNullable();
    table.dateTime("invoked_at").notNullable();

    // Cost metrics
    table.bigInteger("cpu_instructions").notNullable().defaultTo(0);
    table.bigInteger("memory_bytes").notNullable().defaultTo(0);
    table.bigInteger("network_bytes").notNullable().defaultTo(0);
    table.decimal("cpu_cost", 18, 8).notNullable().defaultTo(0);
    table.decimal("memory_cost", 18, 8).notNullable().defaultTo(0);
    table.decimal("network_cost", 18, 8).notNullable().defaultTo(0);
    table.decimal("total_cost", 18, 8).notNullable().defaultTo(0);

    // Status
    table.string("status", 20).notNullable();
    table.string("error_code").nullable();

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["contract_id", "function_name"], "idx_sic_contract_func");
    table.index(["contract_id", "invoked_at"], "idx_sic_contract_time");
    table.index(["function_name", "invoked_at"], "idx_sic_func_time");
    table.index(["ledger_sequence"], "idx_sic_ledger");
  });

  await knex.schema.createTable("soroban_cost_trends", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("contract_id", 120).notNullable();
    table.string("function_name", 100).notNullable();

    // Time window
    table.string("granularity", 20).notNullable();
    table.dateTime("window_start").notNullable();
    table.dateTime("window_end").notNullable();

    // Aggregated metrics
    table.integer("invocation_count").notNullable().defaultTo(0);
    table.decimal("avg_total_cost", 18, 8).notNullable().defaultTo(0);
    table.decimal("min_total_cost", 18, 8).notNullable().defaultTo(0);
    table.decimal("max_total_cost", 18, 8).notNullable().defaultTo(0);
    table.decimal("p50_total_cost", 18, 8).notNullable().defaultTo(0);
    table.decimal("p95_total_cost", 18, 8).notNullable().defaultTo(0);
    table.decimal("p99_total_cost", 18, 8).notNullable().defaultTo(0);

    // Trend indicators
    table.decimal("avg_cpu_instructions", 18, 2).notNullable().defaultTo(0);
    table.decimal("avg_memory_bytes", 18, 2).notNullable().defaultTo(0);

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["contract_id", "function_name", "granularity"], "idx_sct_contract_func_gran");
    table.index(["window_start", "window_end"], "idx_sct_window");
    table.unique(["contract_id", "function_name", "granularity", "window_start"], "uniq_sct_contract_func_window");
  });

  await knex.schema.createTable("soroban_cost_anomalies", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("invocation_id").notNullable().references("id").inTable("soroban_invocation_costs").onDelete("CASCADE");
    table.string("contract_id", 120).notNullable();
    table.string("function_name", 100).notNullable();

    // Anomaly details
    table.string("anomaly_type", 50).notNullable();
    table.decimal("deviation_percent", 7, 2).notNullable();
    table.decimal("baseline_cost", 18, 8).notNullable();
    table.decimal("observed_cost", 18, 8).notNullable();
    table.string("severity", 20).notNullable();

    table.dateTime("detected_at").notNullable();
    table.string("status", 20).notNullable().defaultTo("open");

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["contract_id", "function_name", "detected_at"], "idx_sca_contract_func_time");
    table.index(["severity", "status"], "idx_sca_severity_status");
  });

  // Status domain constraint
  await knex.raw(`
    ALTER TABLE soroban_invocation_costs
    ADD CONSTRAINT chk_sic_status
    CHECK (status IN ('success', 'failed', 'partial'))
  `);

  await knex.raw(`
    ALTER TABLE soroban_cost_anomalies
    ADD CONSTRAINT chk_sca_status
    CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed'))
  `);

  await knex.raw(`
    ALTER TABLE soroban_cost_anomalies
    ADD CONSTRAINT chk_sca_severity
    CHECK (severity IN ('low', 'medium', 'high', 'critical'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("soroban_cost_anomalies");
  await knex.schema.dropTableIfExists("soroban_cost_trends");
  await knex.schema.dropTableIfExists("soroban_invocation_costs");
}
