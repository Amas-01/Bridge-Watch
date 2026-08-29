import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // ── #1036: Historical Alert Replay Export ─────────────────────────────────
  await knex.schema.createTable("alert_replay_exports", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("owner_address", 255).notNullable();
    table.string("status", 20).notNullable().defaultTo("pending");
    table.jsonb("filter_criteria").notNullable();
    table.string("format", 10).notNullable().defaultTo("csv");
    table.text("file_path").nullable();
    table.integer("record_count").nullable();
    table.integer("file_size_bytes").nullable();
    table.text("error_message").nullable();
    table.timestamp("requested_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("completed_at", { useTz: true }).nullable();
    table.index("owner_address");
    table.index("status");
    table.index("requested_at");
  });

  await knex.schema.createTable("alert_replay_events", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.uuid("export_id").notNullable().references("id").inTable("alert_replay_exports").onDelete("cascade");
    table.string("event_id", 255).notNullable();
    table.string("rule_id", 255).notNullable();
    table.string("asset_code", 20).notNullable();
    table.string("alert_type", 50).notNullable();
    table.string("priority", 20).notNullable();
    table.decimal("triggered_value", 20, 8).notNullable();
    table.decimal("threshold", 20, 8).notNullable();
    table.string("metric", 100).notNullable();
    table.jsonb("context").nullable();
    table.timestamp("triggered_at", { useTz: true }).notNullable();
    table.index("export_id");
    table.index("triggered_at");
    table.index(["asset_code", "alert_type"]);
  });

  // ── #1037: Multi-Asset Correlation Analysis ───────────────────────────────
  await knex.schema.createTable("correlation_snapshots", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("asset_a", 20).notNullable();
    table.string("asset_b", 20).notNullable();
    table.string("period", 20).notNullable();
    table.decimal("correlation_coefficient", 10, 6).notNullable();
    table.integer("sample_count").notNullable();
    table.decimal("p_value", 10, 6).nullable();
    table.string("strength", 20).notNullable();
    table.jsonb("metadata").nullable();
    table.timestamp("computed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index(["asset_a", "asset_b"]);
    table.index("period");
    table.index("computed_at");
    table.unique(["asset_a", "asset_b", "period", "computed_at"]);
  });

  await knex.schema.createTable("correlation_alerts", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("owner_address", 255).notNullable();
    table.string("asset_a", 20).notNullable();
    table.string("asset_b", 20).notNullable();
    table.string("condition", 50).notNullable();
    table.decimal("threshold", 10, 6).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("last_triggered_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("owner_address");
    table.index(["asset_a", "asset_b"]);
  });

  // ── #1038: Liquidity Route Simulation API ─────────────────────────────────
  await knex.schema.createTable("liquidity_simulations", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("owner_address", 255).notNullable();
    table.string("status", 20).notNullable().defaultTo("pending");
    table.string("source_asset", 20).notNullable();
    table.string("target_asset", 20).notNullable();
    table.decimal("input_amount", 20, 8).notNullable();
    table.jsonb("constraints").nullable();
    table.jsonb("result").nullable();
    table.decimal("output_amount", 20, 8).nullable();
    table.decimal("price_impact_pct", 10, 4).nullable();
    table.integer("route_hops").nullable();
    table.integer("estimated_fee_stroops").nullable();
    table.text("error_message").nullable();
    table.timestamp("simulated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("owner_address");
    table.index("source_asset");
    table.index("target_asset");
    table.index("simulated_at");
  });

  // ── #1039: Bridge Operator Capacity Metrics ───────────────────────────────
  await knex.schema.createTable("operator_capacity_snapshots", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("operator_address", 255).notNullable();
    table.string("bridge_id", 100).notNullable();
    table.decimal("max_capacity", 20, 8).notNullable();
    table.decimal("current_utilization", 20, 8).notNullable();
    table.decimal("utilization_pct", 10, 4).notNullable();
    table.string("status", 20).notNullable().defaultTo("active");
    table.jsonb("metadata").nullable();
    table.timestamp("snapshot_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("operator_address");
    table.index("bridge_id");
    table.index("snapshot_at");
    table.index(["operator_address", "bridge_id"]);
  });

  await knex.schema.createTable("operator_capacity_alerts", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("owner_address", 255).notNullable();
    table.string("operator_address", 255).notNullable();
    table.string("bridge_id", 100).notNullable();
    table.string("condition", 50).notNullable();
    table.decimal("threshold_pct", 10, 4).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("last_triggered_at", { useTz: true }).nullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.index("owner_address");
    table.index(["operator_address", "bridge_id"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("operator_capacity_alerts");
  await knex.schema.dropTableIfExists("operator_capacity_snapshots");
  await knex.schema.dropTableIfExists("liquidity_simulations");
  await knex.schema.dropTableIfExists("correlation_alerts");
  await knex.schema.dropTableIfExists("correlation_snapshots");
  await knex.schema.dropTableIfExists("alert_replay_events");
  await knex.schema.dropTableIfExists("alert_replay_exports");
}
