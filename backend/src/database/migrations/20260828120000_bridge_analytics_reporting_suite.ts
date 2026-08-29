import type { Knex } from "knex";

/**
 * Bridge analytics reporting suite.
 *
 * Adds persistence for:
 *  - `address_labels`: human-readable labels/categories attached to chain
 *    addresses (exchange, bridge contract, known attacker, etc.) used by the
 *    transaction address labeling service (#1152).
 *  - `chart_sampling_profiles`: reusable named downsampling configurations
 *    used by the chart data sampling controls (#1151) so dashboards can
 *    reference a saved strategy instead of re-specifying parameters per call.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("address_labels", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("address", 128).notNullable();
    table.string("chain", 32).notNullable().defaultTo("stellar");
    table.string("label", 128).notNullable();
    // exchange | bridge_contract | contract | individual | suspicious | internal | other
    table.string("category", 32).notNullable().defaultTo("other");
    table.text("notes").nullable();
    // 0-100 confidence that the label is accurate
    table.integer("confidence").notNullable().defaultTo(100);
    table.string("source", 64).notNullable().defaultTo("manual");
    table.string("created_by", 128).notNullable();
    table.boolean("is_active").notNullable().defaultTo(true);
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(["address", "chain"], { indexName: "uq_address_labels_address_chain" });
    table.index(["category"], "idx_address_labels_category");
    table.index(["chain", "is_active"], "idx_address_labels_chain_active");

    table.check(
      "confidence >= 0 AND confidence <= 100",
      [],
      "chk_address_labels_confidence_range"
    );
  });

  await knex.schema.createTable("chart_sampling_profiles", (table) => {
    table.uuid("id").primary().defaultTo(knex.raw("gen_random_uuid()"));
    table.string("name", 128).notNullable().unique();
    table.string("description", 500).nullable();
    // lttb | fixed_interval | min_max | nth_point
    table.string("strategy", 32).notNullable().defaultTo("lttb");
    table.integer("max_points").notNullable().defaultTo(500);
    table.integer("min_interval_seconds").nullable();
    table.boolean("enabled").notNullable().defaultTo(true);
    table.string("created_by", 128).notNullable();
    table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.check("max_points > 0 AND max_points <= 100000", [], "chk_sampling_profile_max_points");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("chart_sampling_profiles");
  await knex.schema.dropTableIfExists("address_labels");
}
