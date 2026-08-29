import type { Knex } from "knex";

/**
 * Alert Noise Reduction Recommendations (#1093)
 * Stores analysis results and recommendations for reducing alert fatigue.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("alert_noise_reduction_analyses", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("account_id").notNullable().references("id").inTable("admin_accounts").onDelete("CASCADE");

    // Analysis metadata
    table.string("alert_rule_id", 120).notNullable();
    table.string("status", 30).notNullable().defaultTo("pending");
    table.integer("sample_size").notNullable().defaultTo(0);
    table.dateTime("analysis_window_start").notNullable();
    table.dateTime("analysis_window_end").notNullable();

    // Metrics
    table.decimal("false_positive_rate", 5, 4).nullable();
    table.decimal("alert_fatigue_score", 5, 2).nullable();
    table.integer("total_alerts_fired").notNullable().defaultTo(0);
    table.integer("confirmed_incidents").notNullable().defaultTo(0);

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["account_id", "alert_rule_id"], "idx_anra_account_rule");
    table.index(["status", "created_at"], "idx_anra_status_created");
  });

  await knex.schema.createTable("alert_noise_recommendations", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("analysis_id").notNullable().references("id").inTable("alert_noise_reduction_analyses").onDelete("CASCADE");

    // Recommendation details
    table.string("recommendation_type", 50).notNullable();
    table.text("description").notNullable();
    table.decimal("confidence_score", 5, 4).notNullable();
    table.decimal("expected_reduction_percent", 5, 2).notNullable();

    // Implementation details
    table.jsonb("parameters").notNullable().defaultTo("{}");
    table.boolean("is_actionable").notNullable().defaultTo(true);

    table.string("status", 30).notNullable().defaultTo("pending");
    table.dateTime("acknowledged_at").nullable();
    table.dateTime("applied_at").nullable();

    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(["analysis_id", "status"], "idx_anr_analysis_status");
    table.index(["recommendation_type"], "idx_anr_recommendation_type");
  });

  // Status domain constraint
  await knex.raw(`
    ALTER TABLE alert_noise_reduction_analyses
    ADD CONSTRAINT chk_anra_status
    CHECK (status IN ('pending', 'completed', 'failed'))
  `);

  await knex.raw(`
    ALTER TABLE alert_noise_recommendations
    ADD CONSTRAINT chk_anr_status
    CHECK (status IN ('pending', 'acknowledged', 'applied', 'rejected', 'expired'))
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("alert_noise_recommendations");
  await knex.schema.dropTableIfExists("alert_noise_reduction_analyses");
}
