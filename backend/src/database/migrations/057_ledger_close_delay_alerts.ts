import type { Knex } from "knex";

/**
 * Ledger Close Delay Alerts (#1090)
 * Monitors and tracks delays in Stellar ledger closures.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("ledger_close_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.bigInteger("ledger_sequence").notNullable().unique();

    // Timing information
    table.dateTime("expected_close_time").notNullable();
    table.dateTime("actual_close_time").notNullable();
    table.integer("delay_seconds").notNullable().defaultTo(0);

    // Ledger details
    table.string("ledger_hash", 100).notNullable();
    table.integer("transaction_count").notNullable().defaultTo(0);
    table.integer("operation_count").notNullable().defaultTo(0);
    table.string("base_fee_rate", 50).notNullable();

    // Delay classification
    table.string("delay_severity", 20).notNullable().defaultTo("normal");
    table.boolean("is_anomalous").notNullable().defaultTo(false);

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["actual_close_time"], "idx_lce_close_time");
    table.index(["delay_severity"], "idx_lce_delay_severity");
    table.index(["is_anomalous", "actual_close_time"], "idx_lce_anomalous_time");
  });

  await knex.schema.createTable("ledger_close_delay_alerts", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.bigInteger("ledger_sequence").notNullable().references("ledger_sequence").inTable("ledger_close_events").onDelete("CASCADE");

    // Alert details
    table.string("alert_type", 50).notNullable();
    table.integer("delay_seconds").notNullable();
    table.string("severity", 20).notNullable();

    // Thresholds
    table.integer("threshold_seconds").notNullable();
    table.boolean("threshold_exceeded").notNullable().defaultTo(true);

    // Investigation
    table.string("status", 30).notNullable().defaultTo("open");
    table.text("investigation_notes").nullable();
    table.dateTime("resolved_at").nullable();

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["ledger_sequence", "severity"], "idx_lcda_ledger_severity");
    table.index(["status", "created_at"], "idx_lcda_status_created");
    table.index(["alert_type", "created_at"], "idx_lcda_type_created");
  });

  await knex.schema.createTable("ledger_close_delay_stats", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // Time window
    table.string("granularity", 20).notNullable();
    table.dateTime("window_start").notNullable();
    table.dateTime("window_end").notNullable();

    // Statistics
    table.integer("total_ledgers").notNullable().defaultTo(0);
    table.integer("delayed_ledgers").notNullable().defaultTo(0);
    table.decimal("average_delay_seconds", 8, 2).notNullable().defaultTo(0);
    table.integer("max_delay_seconds").notNullable().defaultTo(0);
    table.decimal("p50_delay_seconds", 8, 2).notNullable().defaultTo(0);
    table.decimal("p95_delay_seconds", 8, 2).notNullable().defaultTo(0);
    table.decimal("p99_delay_seconds", 8, 2).notNullable().defaultTo(0);

    // Anomaly metrics
    table.integer("anomaly_count").notNullable().defaultTo(0);
    table.decimal("anomaly_rate_percent", 5, 2).notNullable().defaultTo(0);

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(["granularity", "window_start"], "uniq_lcds_window");
    table.index(["window_start", "window_end"], "idx_lcds_window");
  });

  await knex.schema.createTable("ledger_close_patterns", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));

    // Pattern identification
    table.string("pattern_type", 50).notNullable();
    table.text("description").notNullable();

    // Temporal characteristics
    table.integer("occurrence_count").notNullable().defaultTo(0);
    table.dateTime("first_observed").notNullable();
    table.dateTime("last_observed").notNullable();

    // Impact assessment
    table.decimal("average_impact_seconds", 8, 2).notNullable().defaultTo(0);
    table.string("likelihood", 20).notNullable();

    table.boolean("is_active").notNullable().defaultTo(true);
    table.dateTime("resolved_at").nullable();

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["pattern_type", "is_active"], "idx_lcp_pattern_active");
    table.index(["last_observed"], "idx_lcp_last_observed");
  });

  // Status domain constraints
  await knex.raw(`
    ALTER TABLE ledger_close_delay_alerts
    ADD CONSTRAINT chk_lcda_status
    CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed'))
  `);

  await knex.raw(`
    ALTER TABLE ledger_close_delay_alerts
    ADD CONSTRAINT chk_lcda_severity
    CHECK (severity IN ('low', 'medium', 'high', 'critical'))
  `);

  await knex.raw(`
    ALTER TABLE ledger_close_events
    ADD CONSTRAINT chk_lce_severity
    CHECK (delay_severity IN ('normal', 'minor', 'significant', 'critical'))
  `);

  await knex.raw(`
    ALTER TABLE ledger_close_patterns
    ADD CONSTRAINT chk_lcp_likelihood
    CHECK (likelihood IN ('rare', 'occasional', 'frequent', 'persistent'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("ledger_close_patterns");
  await knex.schema.dropTableIfExists("ledger_close_delay_stats");
  await knex.schema.dropTableIfExists("ledger_close_delay_alerts");
  await knex.schema.dropTableIfExists("ledger_close_events");
}
