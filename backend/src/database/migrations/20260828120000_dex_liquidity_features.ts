import type { Knex } from "knex";

/**
 * DEX liquidity working set (#1157, #1158, #1159, #1160).
 *
 * Four related concerns that all hang off the pools Bridge Watch already
 * tracks in `liquidity_pools`:
 *
 *   #1157  dex_pool_discovery_runs / dex_pool_registry
 *          A DEX's pool set drifts — pools appear, pools go quiet. The registry
 *          is the durable "what have we ever seen on this DEX" view; each
 *          refresh run records what changed so an operator can tell a genuine
 *          delisting from an adapter that briefly returned nothing.
 *
 *   #1158  pool_quality_scores
 *          A ranked snapshot of pool quality, kept as history rather than a
 *          mutable column so a ranking can be explained after the fact.
 *
 *   #1159  market_impact_presets
 *          Named trade-size/slippage scenarios, so "what does a $250k swap do
 *          to this pool" is one click rather than a re-typed number.
 *
 *   #1160  route_quotes
 *          Quotes are only good for a few seconds. Storing the TTL alongside
 *          the quote lets the API refuse a stale one instead of executing it.
 *
 * Pool identity is the adapter-supplied string key (e.g. "stellarx-usdc-xlm"),
 * not a `liquidity_pools.id` FK: pools are discovered from DEX adapters before
 * they are ever persisted locally.
 */
export async function up(knex: Knex): Promise<void> {
  // ---------------------------------------------------------------------------
  // #1157 — DEX pool discovery
  // ---------------------------------------------------------------------------

  await knex.schema.createTable("dex_pool_discovery_runs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("dex", 60).notNullable();
    // running | completed | failed
    t.string("status", 20).notNullable().defaultTo("running");

    t.integer("pools_seen").notNullable().defaultTo(0);
    t.integer("pools_added").notNullable().defaultTo(0);
    t.integer("pools_updated").notNullable().defaultTo(0);
    t.integer("pools_delisted").notNullable().defaultTo(0);

    t.string("error_message", 1000).nullable();
    t.timestamp("started_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("completed_at", { useTz: true }).nullable();
    t.integer("duration_ms").nullable();

    t.index(["dex", "started_at"], "idx_dex_discovery_runs_dex");
    t.index(["status"], "idx_dex_discovery_runs_status");
    t.check(
      "status IN ('running','completed','failed')",
      [],
      "chk_dex_discovery_runs_status"
    );
  });

  await knex.schema.createTable("dex_pool_registry", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("dex", 60).notNullable();
    // Adapter-stable pool identifier within that DEX.
    t.string("pool_key", 200).notNullable();

    t.string("asset_a", 120).notNullable();
    t.string("asset_b", 120).notNullable();
    t.string("contract_address", 120).nullable();
    t.decimal("total_liquidity", 30, 8).notNullable().defaultTo(0);

    // active | delisted — a pool absent from a successful refresh is delisted,
    // never deleted, so its history stays readable.
    t.string("status", 20).notNullable().defaultTo("active");
    t.timestamp("first_seen_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("last_seen_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("delisted_at", { useTz: true }).nullable();
    t.uuid("last_run_id").nullable();

    t.unique(["dex", "pool_key"], { indexName: "uq_dex_pool_registry_key" });
    t.index(["dex", "status"], "idx_dex_pool_registry_status");
    t.check("status IN ('active','delisted')", [], "chk_dex_pool_registry_status");
  });

  // ---------------------------------------------------------------------------
  // #1158 — Liquidity pool quality ranking
  // ---------------------------------------------------------------------------

  await knex.schema.createTable("pool_quality_scores", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("pool_key", 200).notNullable();
    t.string("dex", 60).notNullable();

    // Each component is 0-100; `total_score` is their weighted sum.
    t.decimal("depth_score", 6, 2).notNullable();
    t.decimal("volume_score", 6, 2).notNullable();
    t.decimal("fee_score", 6, 2).notNullable();
    t.decimal("stability_score", 6, 2).notNullable();
    t.decimal("freshness_score", 6, 2).notNullable();
    t.decimal("total_score", 6, 2).notNullable();

    // A-F, derived from total_score; carried so the UI need not re-derive it.
    t.string("grade", 1).notNullable();
    // Position within the batch this row was computed in (1 = best).
    t.integer("rank").notNullable();
    // The raw metrics the score was derived from, for explainability.
    t.jsonb("inputs").notNullable().defaultTo(knex.raw("'{}'::jsonb"));

    t.timestamp("computed_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(["computed_at", "rank"], "idx_pool_quality_batch");
    t.index(["pool_key", "computed_at"], "idx_pool_quality_pool");
  });

  // ---------------------------------------------------------------------------
  // #1159 — Market impact scenario presets
  // ---------------------------------------------------------------------------

  await knex.schema.createTable("market_impact_presets", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("name", 120).notNullable().unique();
    t.string("description", 500).nullable();

    t.decimal("trade_size_usd", 24, 2).notNullable();
    t.decimal("slippage_tolerance_pct", 6, 3).notNullable();

    // System presets ship with the product and cannot be deleted.
    t.boolean("is_system").notNullable().defaultTo(false);
    t.string("created_by", 200).nullable();
    t.timestamps(true, true);

    t.check("trade_size_usd > 0", [], "chk_market_impact_preset_size");
    t.check(
      "slippage_tolerance_pct > 0 AND slippage_tolerance_pct <= 100",
      [],
      "chk_market_impact_preset_slippage"
    );
  });

  // ---------------------------------------------------------------------------
  // #1160 — Route quote expiration
  // ---------------------------------------------------------------------------

  await knex.schema.createTable("route_quotes", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    t.string("owner_address", 120).notNullable();
    t.string("source_asset", 120).notNullable();
    t.string("target_asset", 120).notNullable();

    t.decimal("input_amount", 30, 8).notNullable();
    t.decimal("output_amount", 30, 8).nullable();
    t.decimal("price_impact_pct", 10, 4).nullable();
    t.jsonb("route").nullable();

    t.integer("ttl_seconds").notNullable().defaultTo(30);
    // active | expired | consumed | superseded
    t.string("status", 20).notNullable().defaultTo("active");
    t.timestamp("quoted_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("expires_at", { useTz: true }).notNullable();
    t.timestamp("consumed_at", { useTz: true }).nullable();

    // Refresh chain: the replacement points back at what it replaced, and the
    // replaced quote points forward, so a stale link resolves to the live quote.
    t.uuid("superseded_by").nullable();
    t.uuid("refreshed_from").nullable();

    t.index(["owner_address", "quoted_at"], "idx_route_quotes_owner");
    // The expiry sweep: active quotes past their horizon.
    t.index(["status", "expires_at"], "idx_route_quotes_expiry");
    t.check(
      "status IN ('active','expired','consumed','superseded')",
      [],
      "chk_route_quotes_status"
    );
    t.check("ttl_seconds > 0", [], "chk_route_quotes_ttl");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("route_quotes");
  await knex.schema.dropTableIfExists("market_impact_presets");
  await knex.schema.dropTableIfExists("pool_quality_scores");
  await knex.schema.dropTableIfExists("dex_pool_registry");
  await knex.schema.dropTableIfExists("dex_pool_discovery_runs");
}
